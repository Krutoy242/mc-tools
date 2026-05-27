import type CFV2 from 'curseforge-v2'
import { getClient } from './client.js'

/**
 * Fetch metadata for multiple files at once using the batch endpoint.
 * @param fileIds Array of file IDs
 * @param cfApiKey CurseForge API key
 * @returns Array of file metadata
 */
export async function fetchFiles(
  fileIds: number[],
  cfApiKey: string
): Promise<CFV2.CF2File[]> {
  if (!fileIds.length) return []

  const response = await getClient(cfApiKey).getFiles({ fileIds })
  return response.data?.data ?? []
}

/**
 * Fetch metadata for a single file.
 * @param modId Mod ID the file belongs to
 * @param fileId File ID
 * @param cfApiKey CurseForge API key
 * @returns File metadata
 */
export async function fetchFile(
  modId: number,
  fileId: number,
  cfApiKey: string
): Promise<CFV2.CF2File | undefined> {
  const response = await getClient(cfApiKey).getModFile(modId, fileId)
  return response.data?.data
}
