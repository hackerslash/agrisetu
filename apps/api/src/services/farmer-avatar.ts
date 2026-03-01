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
  };
};

function getAwsConfig(): AwsConfig {
  const region =
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    DEFAULT_REGION;
  const bucket =
    process.env.AWS_FARMER_PROFILE_BUCKET?.trim() ||
    process.env.FARMER_PROFILE_BUCKET?.trim();

  if (!bucket) {
    throw new Error(
      "AWS farmer profile bucket is not configured. Set AWS_FARMER_PROFILE_BUCKET.",
    );
  }

  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID?.trim() || process.env.AWS_ACCESS_KEY?.trim();
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY?.trim() ||
    process.env.AWS_SECRET_KEY?.trim();

  if (accessKeyId && secretAccessKey) {
    return {
      region,
      bucket,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    };
  }

  return { region, bucket };
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
  return `https://${params.bucket}.s3.${params.region}.amazonaws.com/${encodedObjectKey}`;
}

function parseManagedObjectKey(params: {
  avatarUrl: string;
  region: string;
  bucket: string;
}) {
  const s3UriPrefix = `s3://${params.bucket}/`;
  if (params.avatarUrl.startsWith(s3UriPrefix)) {
    return decodeURIComponent(params.avatarUrl.slice(s3UriPrefix.length));
  }

  const directPrefix = `https://${params.bucket}.s3.${params.region}.amazonaws.com/`;
  if (params.avatarUrl.startsWith(directPrefix)) {
    return decodeURIComponent(params.avatarUrl.slice(directPrefix.length));
  }

  const globalPrefix = `https://${params.bucket}.s3.amazonaws.com/`;
  if (params.avatarUrl.startsWith(globalPrefix)) {
    return decodeURIComponent(params.avatarUrl.slice(globalPrefix.length));
  }

  return null;
}

function encodeObjectKeyPath(objectKey: string) {
  return `/${objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
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
  const query = new URLSearchParams();
  const entries = Object.entries(request.query ?? {});
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (const v of value) query.append(key, String(v));
      continue;
    }
    if (value == null) continue;
    query.append(key, String(value));
  }

  const protocol = request.protocol ?? "https:";
  const port = request.port ? `:${request.port}` : "";
  const queryString = query.toString();
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
  });

  const unsigned = new HttpRequest({
    protocol: "https:",
    hostname: `${params.bucket}.s3.${params.region}.amazonaws.com`,
    method: "GET",
    path: encodeObjectKeyPath(params.objectKey),
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
