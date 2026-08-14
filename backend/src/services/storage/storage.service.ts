export interface StorageService {
  saveFile(data: Buffer, filename: string, contentType: string): Promise<{
    url: string;
  }>;
}
