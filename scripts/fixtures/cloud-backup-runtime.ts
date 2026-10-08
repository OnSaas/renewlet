import { CloudBackupRemoteError, S3CloudBackupClient } from "../../apps/worker/src/cloud-backup-remote";

// 由 Wrangler 打包后在独立 workerd 中执行；只替换远端响应，SDK 入口、签名和 XML 解析仍走实际构建路径。
export default {
  async fetch(request: Request): Promise<Response> {
    const scenario = new URL(request.url).searchParams.get("scenario");
    const prefix = scenario === "pages" ? "backups/" : "";
    const id = "renewlet-export-v1-20261004T182855Z-4c43d1e5";
    const manifest = {
      kind: "renewlet-cloud-backup-snapshot",
      schemaVersion: 1,
      id,
      filename: `${id}.zip`,
      createdAt: "2026-10-04T18:28:55.000Z",
      sizeBytes: 261653,
      sha256: "a".repeat(64),
      exportKind: "renewlet-export",
      exportSchemaVersion: 1,
    };
    const calls: Array<{ method: string; path: string; prefix: string | null; maxKeys: string | null; token: string | null }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const target = new URL(input instanceof Request ? input.url : String(input));
      calls.push({
        method: init?.method ?? (input instanceof Request ? input.method : "GET"),
        path: target.pathname,
        prefix: target.searchParams.get("prefix"),
        maxKeys: target.searchParams.get("max-keys"),
        token: target.searchParams.get("continuation-token"),
      });
      if (target.searchParams.has("list-type")) {
        if (scenario === "forbidden") {
          return new Response("<Error><Code>AccessDenied</Code><Message>Missing list permission</Message></Error>", {
            status: 403,
            headers: { "content-type": "application/xml", "x-amz-request-id": "forbidden-request" },
          });
        }
        if (scenario === "invalid-xml") return new Response("not xml", { headers: { "content-type": "application/xml" } });
        const firstPage = scenario === "pages" && !target.searchParams.has("continuation-token");
        return new Response(`<?xml version='1.0' encoding='utf-8'?>
          <ListBucketResult xmlns="http://s3.amazonaws.com/doc/2006-03-01/">
            <Name>backup-test</Name><EncodingType>url</EncodingType><Prefix>${prefix}</Prefix>
            <StartAfter/><ContinuationToken/><KeyCount>${firstPage ? 0 : 2}</KeyCount><MaxKeys>1000</MaxKeys>
            <IsTruncated>${firstPage}</IsTruncated>
            ${firstPage ? "<NextContinuationToken>next-page</NextContinuationToken>" : `
              <Contents><Key>${prefix}${id}.manifest.json</Key><Size>399</Size><ETag>&quot;manifest-etag&quot;</ETag>
                <Owner><ID>test-owner</ID><DisplayName>test-owner</DisplayName></Owner><StorageClass>STANDARD</StorageClass></Contents>
              <Contents><Key>${prefix}${id}.zip</Key><Size>261653</Size></Contents>`}
          </ListBucketResult>`, { headers: { "content-type": "application/xml" } });
      }
      if (target.pathname.endsWith(`${id}.manifest.json`)) return Response.json(manifest);
      throw new Error(`Unexpected S3 operation: ${target.pathname}`);
    };
    try {
      const client = new S3CloudBackupClient({
        endpoint: "https://storage.example.com",
        bucket: "backup-test",
        region: "us-east-1",
        prefix: prefix.replace(/\/$/, ""),
        addressingStyle: "auto",
        accessKeyId: "test-access",
      }, "test-secret");
      return Response.json({ snapshots: await client.list(), calls });
    } catch (error) {
      if (!(error instanceof CloudBackupRemoteError)) throw error;
      return Response.json({ code: error.code, details: error.details, calls }, { status: 400 });
    } finally {
      globalThis.fetch = originalFetch;
    }
  },
};
