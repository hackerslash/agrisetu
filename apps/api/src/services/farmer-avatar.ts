import crypto from "crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { Credentials } from "@aws-sdk/types";
import { Hash } from "@smithy/hash-node";
import { HttpRequest } from "@smithy/protocol-http";
import { SignatureV4 } from "@smithy/signature-v4";

const DEFAULT_REGION = "ap-south-1";

type AwsConfig = {
  region: string;
  bucket: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
  };
};

function getAwsConfig(): AwsConfig {
  const region = process.env.AWS_REGION?.trim() || DEFAULT_REGION;
  const bucket = process.env.AWS_FARMER_PROFILE_BUCKET?.trim();

  if (!bucket) {
    throw new Error(
      "AWS farmer profile bucket is not configured. Set AWS_FARMER_PROFILE_BUCKET.",
    );
  }

  const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
  const sessionToken = process.env.AWS_SESSION_TOKEN?.trim();

  if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
    throw new Error(
      "Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or neither.",
    );
  }

  if (accessKeyId && secretAccessKey) {
    return {
      region,
      bucket,
      credentials: {
        accessKeyId,
        secretAccessKey,
        ...(sessionToken ? { sessionToken } : {}),
      },
    };
  }

  return { region, bucket };
}

function shouldUseUnsignedAvatarUrls() {
  const value = process.env.AWS_FARMER_AVATAR_UNSIGNED_URLS?.trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

function resolveImageExtension(params: { fileName?: string; mimeType?: string }) {
  const lowerName = (params.fileName ?? "").toLowerCase();
  const lowerMime = (params.mimeType ?? "").toLowerCase();

  if (lowerName.endsWith(".png") || lowerMime.includes("png")) return "png";
  if (lowerName.endsWith(".webp") || lowerMime.includes("webp")) return "webp";
  return "jpg";
}

function resolveContentType(extension: string) {
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "jpg":
    default:
      return "image/jpeg";
  }
}

function toPublicUrl(params: { region: string; bucket: string; objectKey: string }) {
  const encodedObjectKey = params.objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://s3.${params.region}.amazonaws.com/${params.bucket}/${encodedObjectKey}`;
}

function trimQueryAndHash(value: string) {
  const hashIndex = value.indexOf("#");
  const queryIndex = value.indexOf("?");
  let endIndex = value.length;
  if (hashIndex >= 0) endIndex = Math.min(endIndex, hashIndex);
  if (queryIndex >= 0) endIndex = Math.min(endIndex, queryIndex);
  return value.slice(0, endIndex);
}

function parseManagedObjectKey(params: {
  avatarUrl: string;
  region: string;
  bucket: string;
}) {
  const s3UriPrefix = `s3://${params.bucket}/`;
  if (params.avatarUrl.startsWith(s3UriPrefix)) {
    return decodeURIComponent(
      trimQueryAndHash(params.avatarUrl.slice(s3UriPrefix.length)),
    );
  }

  const directPrefix = `https://${params.bucket}.s3.${params.region}.amazonaws.com/`;
  if (params.avatarUrl.startsWith(directPrefix)) {
    return decodeURIComponent(
      trimQueryAndHash(params.avatarUrl.slice(directPrefix.length)),
    );
  }

  const globalPrefix = `https://${params.bucket}.s3.amazonaws.com/`;
  if (params.avatarUrl.startsWith(globalPrefix)) {
    return decodeURIComponent(
      trimQueryAndHash(params.avatarUrl.slice(globalPrefix.length)),
    );
  }

  const pathStylePrefix = `https://s3.${params.region}.amazonaws.com/${params.bucket}/`;
  if (params.avatarUrl.startsWith(pathStylePrefix)) {
    return decodeURIComponent(
      trimQueryAndHash(params.avatarUrl.slice(pathStylePrefix.length)),
    );
  }

  const pathStyleGlobalPrefix = `https://s3.amazonaws.com/${params.bucket}/`;
  if (params.avatarUrl.startsWith(pathStyleGlobalPrefix)) {
    return decodeURIComponent(
      trimQueryAndHash(params.avatarUrl.slice(pathStyleGlobalPrefix.length)),
    );
  }

  return null;
}

function encodeObjectKeyPath(objectKey: string) {
  return `/${objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

function encodeQueryComponent(value: string) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

type SignedRequestLike = {
  protocol?: string;
  hostname: string;
  port?: number;
  path: string;
  query?: Record<
    string,
    | string
    | number
    | boolean
    | null
    | Array<string | number | boolean | null>
    | undefined
  >;
};

function formatHttpRequestUrl(request: SignedRequestLike) {
  const queryPairs: string[] = [];
  const entries = Object.entries(request.query ?? {});
  for (const [key, value] of entries) {
    const encodedKey = encodeQueryComponent(key);
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v == null) continue;
        queryPairs.push(`${encodedKey}=${encodeQueryComponent(String(v))}`);
      }
      continue;
    }
    if (value == null) continue;
    queryPairs.push(`${encodedKey}=${encodeQueryComponent(String(value))}`);
  }

  const protocol = request.protocol ?? "https:";
  const port = request.port ? `:${request.port}` : "";
  const queryString = queryPairs.join("&");
  return `${protocol}//${request.hostname}${port}${request.path}${
    queryString ? `?${queryString}` : ""
  }`;
}

async function resolveSigningCredentials(aws: AwsConfig): Promise<Credentials> {
  const s3 = new S3Client({
    region: aws.region,
    credentials: aws.credentials,
  });

  const credentialProvider = s3.config.credentials;
  if (!credentialProvider) {
    throw new Error("Unable to resolve AWS credentials for avatar URL signing");
  }

  if (typeof credentialProvider === "function") {
    return credentialProvider();
  }
  return credentialProvider;
}

async function buildSignedGetUrl(params: {
  region: string;
  bucket: string;
  objectKey: string;
  credentials: Credentials;
  expiresInSeconds?: number;
}) {
  const signer = new SignatureV4({
    service: "s3",
    region: params.region,
    credentials: params.credentials,
    sha256: Hash.bind(null, "sha256"),
    // S3 uses its own path canonicalization rules for SigV4.
    uriEscapePath: false,
  });

  const unsigned = new HttpRequest({
    protocol: "https:",
    hostname: `s3.${params.region}.amazonaws.com`,
    method: "GET",
    path: `/${encodeURIComponent(params.bucket)}${encodeObjectKeyPath(
      params.objectKey,
    )}`,
    headers: {
      host: `s3.${params.region}.amazonaws.com`,
      "x-amz-content-sha256": "UNSIGNED-PAYLOAD",
    },
  });

  const signed = await signer.presign(unsigned, {
    expiresIn: params.expiresInSeconds ?? 60 * 60 * 24,
  });

  return formatHttpRequestUrl(signed);
}

export async function uploadFarmerAvatar(params: {
  farmerId: string;
  avatarBuffer: Buffer;
  fileName?: string;
  mimeType?: string;
}) {
  if (!params.avatarBuffer || params.avatarBuffer.length === 0) {
    throw new Error("Avatar payload is empty");
  }

  const aws = getAwsConfig();
  const extension = resolveImageExtension({
    fileName: params.fileName,
    mimeType: params.mimeType,
  });
  const random = crypto.randomBytes(6).toString("hex");
  const timestamp = Date.now();
  const objectKey = `farmer-avatars/${params.farmerId}/${timestamp}-${random}.${extension}`;

  const s3 = new S3Client({
    region: aws.region,
    credentials: aws.credentials,
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: aws.bucket,
      Key: objectKey,
      Body: params.avatarBuffer,
      ContentType: resolveContentType(extension),
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );

  return {
    avatarUrl: toPublicUrl({
      region: aws.region,
      bucket: aws.bucket,
      objectKey,
    }),
  };
}

export async function deleteFarmerAvatarIfManaged(avatarUrl: string) {
  if (!avatarUrl) return;

  const aws = getAwsConfig();
  const objectKey = parseManagedObjectKey({
    avatarUrl,
    region: aws.region,
    bucket: aws.bucket,
  });
  if (!objectKey) return;

  const s3 = new S3Client({
    region: aws.region,
    credentials: aws.credentials,
  });

  await s3.send(
    new DeleteObjectCommand({
      Bucket: aws.bucket,
      Key: objectKey,
    }),
  );
}

export async function resolveFarmerAvatarUrlForClient(avatarUrl?: string | null) {
  if (!avatarUrl) return avatarUrl ?? null;

  const aws = getAwsConfig();
  const objectKey = parseManagedObjectKey({
    avatarUrl,
    region: aws.region,
    bucket: aws.bucket,
  });

  if (!objectKey) {
    return avatarUrl;
  }

  if (shouldUseUnsignedAvatarUrls()) {
    return toPublicUrl({
      region: aws.region,
      bucket: aws.bucket,
      objectKey,
    });
  }

  const credentials = await resolveSigningCredentials(aws);
  return buildSignedGetUrl({
    region: aws.region,
    bucket: aws.bucket,
    objectKey,
    credentials,
  });
}

export async function withFarmerAvatarForClient<T extends { avatarUrl?: string | null }>(
  farmer: T,
): Promise<T> {
  const avatarUrl = await resolveFarmerAvatarUrlForClient(
    farmer.avatarUrl ?? null,
  ).catch(() => farmer.avatarUrl ?? null);
  return {
    ...farmer,
    avatarUrl,
  };
}
