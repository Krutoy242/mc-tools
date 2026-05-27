import CFV2 from 'curseforge-v2'

const { CFV2Client } = CFV2

let cachedClient: { key: string, client: CFV2.CFV2Client } | undefined

export function getClient(cfApiKey: string): CFV2.CFV2Client {
  if (!cachedClient || cachedClient.key !== cfApiKey) {
    cachedClient = { key: cfApiKey, client: new CFV2Client({ apiKey: cfApiKey }) }
  }
  return cachedClient.client
}
