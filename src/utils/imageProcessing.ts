/**
 * Image processing utilities for resizing and compressing images before upload
 */

export interface ProcessImageOptions {
  maxWidth: number;
  quality: number;
}

/**
 * Process an image file by resizing and compressing it
 * @param file - The original image file
 * @param maxWidth - Maximum width in pixels (maintains aspect ratio)
 * @param quality - JPEG quality (0.0 to 1.0)
 * @returns Promise<File> - Processed image file
 */
export async function processImageForUpload(
  file: File,
  maxWidth: number = 750,
  quality: number = 0.8
): Promise<File> {
  return new Promise((resolve, reject) => {
    // Create an image element to load the file
    const img = new Image();
    
    img.onload = () => {
      try {
        // Create a canvas element
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }
        
        // Calculate new dimensions while maintaining aspect ratio
        let { width, height } = img;
        
        if (width > maxWidth) {
          const ratio = maxWidth / width;
          width = maxWidth;
          height = height * ratio;
        }
        
        // Set canvas dimensions
        canvas.width = width;
        canvas.height = height;
        
        // Configure canvas for better image quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // Draw the image onto the canvas with new dimensions
        ctx.drawImage(img, 0, 0, width, height);
        
        // Convert canvas to blob with compression
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('Failed to process image'));
              return;
            }
            
            // Create a new file from the processed blob
            const processedFile = new File(
              [blob],
              generateProcessedFilename(file.name),
              {
                type: 'image/jpeg',
                lastModified: Date.now()
              }
            );
            
            resolve(processedFile);
          },
          'image/jpeg',
          quality
        );
      } catch (error) {
        reject(new Error(`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    };
    
    img.onerror = () => {
      reject(new Error('Failed to load image'));
    };
    
    // Load the image
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Generate a filename for the processed image
 * @param originalFilename - The original filename
 * @returns string - New filename with .jpg extension
 */
function generateProcessedFilename(originalFilename: string): string {
  // Remove the original extension and add .jpg
  const nameWithoutExt = originalFilename.replace(/\.[^/.]+$/, '');
  
  // Clean the filename to be web-friendly
  const cleanName = nameWithoutExt
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase();
  
  return `${cleanName}.jpg`;
}

/**
 * Get the size reduction information for display
 * @param originalFile - Original file
 * @param processedFile - Processed file
 * @returns Object with size information
 */
export function getSizeReduction(originalFile: File, processedFile: File) {
  const originalSize = originalFile.size;
  const processedSize = processedFile.size;
  const reduction = ((originalSize - processedSize) / originalSize) * 100;
  
  return {
    originalSize: formatFileSize(originalSize),
    processedSize: formatFileSize(processedSize),
    reduction: Math.round(reduction)
  };
}

/**
 * Format file size in human readable format
 * @param bytes - File size in bytes
 * @returns string - Formatted size
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}