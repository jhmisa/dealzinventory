export interface ImageSearchProvider {
  key: string
  isConfigured(): boolean
  search(query: string, limit: number): Promise<string[]> // image URLs
}
