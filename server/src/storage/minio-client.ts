import * as Minio from 'minio';
import { Readable } from 'stream';
import * as fs from 'fs/promises';

export interface StorageConfig {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  uploadBucket: string;
  resultsBucket: string;
}

export class MinioStorage {
  private client: Minio.Client;
  private uploadBucket: string;
  private resultsBucket: string;

  constructor(config: StorageConfig) {
    this.client = new Minio.Client({
      endPoint: config.endpoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });

    this.uploadBucket = config.uploadBucket;
    this.resultsBucket = config.resultsBucket;
  }

  /**
   * Upload file from local path to MinIO
   */
  async uploadFile(
    localPath: string,
    objectName: string,
    bucket: 'upload' | 'result' = 'upload'
  ): Promise<{ etag: string; versionId?: string | null }> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;

    const stat = await fs.stat(localPath);
    const metaData = {
      'Content-Type': 'application/sla', // STL MIME type
      'Content-Length': stat.size,
    };

    return await this.client.fPutObject(targetBucket, objectName, localPath, metaData);
  }

  /**
   * Upload buffer/stream to MinIO
   */
  async uploadBuffer(
    buffer: Buffer,
    objectName: string,
    bucket: 'upload' | 'result' = 'upload'
  ): Promise<{ etag: string; versionId?: string | null }> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;

    const metaData = {
      'Content-Type': 'application/sla',
      'Content-Length': buffer.length,
    };

    return await this.client.putObject(targetBucket, objectName, buffer, metaData);
  }

  /**
   * Download file from MinIO to local path
   */
  async downloadFile(
    objectName: string,
    localPath: string,
    bucket: 'upload' | 'result' = 'result'
  ): Promise<void> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;
    await this.client.fGetObject(targetBucket, objectName, localPath);
  }

  /**
   * Get file as buffer
   */
  async getFileBuffer(
    objectName: string,
    bucket: 'upload' | 'result' = 'result'
  ): Promise<Buffer> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;

    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];

      this.client.getObject(targetBucket, objectName, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    });
  }

  /**
   * Get pre-signed download URL (expires in 24 hours)
   */
  async getDownloadUrl(
    objectName: string,
    bucket: 'upload' | 'result' = 'result',
    expirySeconds: number = 24 * 60 * 60
  ): Promise<string> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;
    return await this.client.presignedGetObject(targetBucket, objectName, expirySeconds);
  }

  /**
   * List all objects in a folder
   */
  async listObjects(
    prefix: string,
    bucket: 'upload' | 'result' = 'result'
  ): Promise<Minio.BucketItem[]> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;

    return new Promise((resolve, reject) => {
      const objects: Minio.BucketItem[] = [];
      const stream = this.client.listObjectsV2(targetBucket, prefix, true);

      stream.on('data', (obj) => objects.push(obj));
      stream.on('end', () => resolve(objects));
      stream.on('error', reject);
    });
  }

  /**
   * Delete an object
   */
  async deleteObject(
    objectName: string,
    bucket: 'upload' | 'result' = 'result'
  ): Promise<void> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;
    await this.client.removeObject(targetBucket, objectName);
  }

  /**
   * Delete all objects with a prefix (e.g., delete entire job)
   */
  async deleteObjects(
    prefix: string,
    bucket: 'upload' | 'result' = 'result'
  ): Promise<void> {
    const objects = await this.listObjects(prefix, bucket);
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;

    if (objects.length === 0) return;

    const objectNames = objects.map((obj) => obj.name).filter((name): name is string => name !== undefined);
    await this.client.removeObjects(targetBucket, objectNames);
  }

  /**
   * Check if object exists
   */
  async objectExists(
    objectName: string,
    bucket: 'upload' | 'result' = 'result'
  ): Promise<boolean> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;

    try {
      await this.client.statObject(targetBucket, objectName);
      return true;
    } catch (err: any) {
      if (err.code === 'NotFound') {
        return false;
      }
      throw err;
    }
  }

  /**
   * Get object metadata
   */
  async getObjectStat(
    objectName: string,
    bucket: 'upload' | 'result' = 'result'
  ): Promise<Minio.BucketItemStat> {
    const targetBucket = bucket === 'upload' ? this.uploadBucket : this.resultsBucket;
    return await this.client.statObject(targetBucket, objectName);
  }
}

// Singleton instance
let storageInstance: MinioStorage | null = null;

export function getStorageClient(): MinioStorage {
  if (!storageInstance) {
    const config: StorageConfig = {
      endpoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || '',
      secretKey: process.env.MINIO_SECRET_KEY || '',
      uploadBucket: process.env.UPLOAD_BUCKET || 'uploads',
      resultsBucket: process.env.RESULTS_BUCKET || 'results',
    };

    storageInstance = new MinioStorage(config);
  }

  return storageInstance;
}
