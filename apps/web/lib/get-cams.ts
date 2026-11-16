import { internalApiFetch } from './internal-api-client'

export type NearbyCam = {
  id: string
  name: string
  cam_type: 'beach' | 'pier'
  url: string
  distance_miles: number
}

/** Public live-cam links near a location (apps/api's
 * `/v1/locations/{id}/cams`). Enrichment only: any failure is `[]`. */
export async function fetchNearbyCams(locationId: string): Promise<NearbyCam[]> {
  try {
    return await internalApiFetch<NearbyCam[]>(
      `/v1/locations/${encodeURIComponent(locationId)}/cams`,
    )
  } catch {
    return []
  }
}
