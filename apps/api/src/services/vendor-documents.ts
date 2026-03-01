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
const DEFAULT_URL_TTL_SECONDS = 60 * 60 * 24;

type AwsConfig = {
  region: string;
  bucket: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
};

type DocType = "PAN" | "GST" | "QUALITY_CERT";

function getAwsConfig(): AwsConfig {
  const region =
    process.env.AWS_REGION?.trim() ||
    process.env.AWS_DEFAULT_REGION?.trim() ||
    DEFAULT_REGION;
  const bucket =
    process.env.AWS_VENDOR_DOCS_BUCKET?.trim() ||
    process.env.VENDOR_DOCS_BUCKET?.trim();

  if (!bucket) {
    throw new Error(
      "AWS vendor documents bucket is not configured. Set AWS_VENDOR_DOCS_BUCKET.",
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

function resolveDocExtension(params: { fileName?: string; mimeType?: string }) {
  const lowerName = (params.fileName ?? "").toLowerCase();
  const lowerMime = (params.mimeType ?? "").toLowerCase();

  if (lowerName.endsWith(".pdf") || lowerMime.includes("pdf")) return "pdf";
  if (lowerName.endsWith(".png") || lowerMime.includes("png")) return "png";
  if (lowerName.endsWith(".webp") || lowerMime.includes("webp")) return "webp";
  if (lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg")) return "jpg";
  return "jpg";
}

function resolveContentType(extension: string) {
  switch (extension) {
    case "pdf":
      return "application/pdf";
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
  fileUrl: string;
  region: string;
  bucket: string;
}) {
  const s3Prefix = `s3://${params.bucket}/`;
  if (params.fileUrl.startsWith(s3Prefix)) {
    return decodeURIComponent(params.fileUrl.slice(s3Prefix.length));
  }

  const directPrefix = `https://${params.bucket}.s3.${params.region}.amazonaws.com/`;
  if (params.fileUrl.startsWith(directPrefix)) {
    const tail = params.fileUrl.slice(directPrefix.length);
    return decodeURIComponent(tail.split("?")[0] ?? tail);
  }

  const globalPrefix = `https://${params.bucket}.s3.amazonaws.com/`;
  if (params.fileUrl.startsWith(globalPrefix)) {
    const tail = params.fileUrl.slice(globalPrefix.length);
    return decodeURIComponent(tail.split("?")[0] ?? tail);
  }

  return null;
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
      for (const v of value) {
        if (v != null) query.append(key, String(v));
      }
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

function encodeObjectKeyPath(objectKey: string) {
  return `/${objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/")}`;
}

async function resolveSigningCredentials(aws: AwsConfig): Promise<Credentials> {
  const s3 = new S3Client({
    region: aws.region,
    credentials: aws.credentials,
  });

  const credentialProvider = s3.config.credentials;
  if (!credentialProvider) {
    throw new Error("Unable to resolve AWS credentials for vendor document URL signing");
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
    expiresIn: params.expiresInSeconds ?? DEFAULT_URL_TTL_SECONDS,
  });

  return formatHttpRequestUrl(signed);
}

export async function uploadVendorDocumentBuffer(params: {
  vendorId: string;
  docType: DocType;
  fileBuffer: Buffer;
  fileName?: string;
  mimeType?: string;
}) {
  if (!params.fileBuffer || params.fileBuffer.length === 0) {
    throw new Error("Document payload is empty");
  }

  const aws = getAwsConfig();
  const extension = resolveDocExtension({
    fileName: params.fileName,
    mimeType: params.mimeType,
  });
  const random = crypto.randomBytes(6).toString("hex");
  const timestamp = Date.now();
  const objectKey = `vendor-documents/${params.vendorId}/${params.docType.toLowerCase()}/${timestamp}-${random}.${extension}`;

  const s3 = new S3Client({
    region: aws.region,
    credentials: aws.credentials,
  });

  await s3.send(
    new PutObjectCommand({
      Bucket: aws.bucket,
      Key: objectKey,
      Body: params.fileBuffer,
      ContentType: resolveContentType(extension),
    }),
  );

  return {
    fileUrl: toPublicUrl({
      region: aws.region,
      bucket: aws.bucket,
      objectKey,
    }),
  };
}

export async function deleteVendorDocumentIfManaged(fileUrl: string) {
  if (!fileUrl) return;

  const aws = getAwsConfig();
  const objectKey = parseManagedObjectKey({
    fileUrl,
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

export async function resolveVendorDocumentUrlForClient(fileUrl?: string | null) {
  if (!fileUrl) return fileUrl ?? null;

  const aws = getAwsConfig();
  const objectKey = parseManagedObjectKey({
    fileUrl,
    region: aws.region,
    bucket: aws.bucket,
  });

  if (!objectKey) {
    return fileUrl;
  }

  const credentials = await resolveSigningCredentials(aws);
  return buildSignedGetUrl({
    region: aws.region,
    bucket: aws.bucket,
    objectKey,
    credentials,
  });
}

export async function withVendorDocumentForClient<T extends { fileUrl: string }>(
  doc: T,
): Promise<T> {
  const signed = await resolveVendorDocumentUrlForClient(doc.fileUrl).catch(
    () => doc.fileUrl,
  );
  return {
    ...doc,
    fileUrl: signed ?? doc.fileUrl,
  };
}

export async function withVendorDocumentsForClient<
  T extends { documents?: Array<{ fileUrl: string }> },
>(vendor: T): Promise<T> {
  const docs = vendor.documents ?? [];
  if (docs.length === 0) return vendor;

  const signedDocs = await Promise.all(docs.map((doc) => withVendorDocumentForClient(doc)));
  return {
    ...vendor,
    documents: signedDocs as T["documents"],
  };
}
