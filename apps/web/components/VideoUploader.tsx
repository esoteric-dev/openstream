'use client';
import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/api';

interface UploadedVideo {
  key: string;
  name: string;
  url: string;
}

interface Props {
  onUploaded: (video: UploadedVideo) => void;
}

export default function VideoUploader({ onUploaded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function handleFile(file: File) {
    setError('');
    setProgress(0);

    try {
      // 1. Get presigned URL from API
      const { url, key, publicUrl } = await apiFetch('/api/uploads/presigned-url', {
        method: 'POST',
        body: JSON.stringify({ filename: file.name, contentType: file.type }),
      });

      // 2. Upload directly to MinIO/S3 using XHR for progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', file.type);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
        };

        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed: ${xhr.statusText}`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
      });

      setProgress(null);
      onUploaded({ key, name: file.name, url: publicUrl });
    } catch (err: any) {
      setError(err.message || 'Upload failed');
      setProgress(null);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div>
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-600 hover:border-purple-500 rounded-lg p-6 text-center cursor-pointer transition-colors"
      >
        <input
          ref={inputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mpeg"
          onChange={handleChange}
          className="hidden"
        />
        {progress !== null ? (
          <div className="space-y-2">
            <p className="text-sm text-gray-300">Uploading… {progress}%</p>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-purple-500 h-2 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div>
            <p className="text-sm text-gray-300">Drop a video here or <span className="text-purple-400">click to browse</span></p>
            <p className="text-xs text-gray-500 mt-1">MP4, MOV, WebM, AVI — max 1 hour</p>
          </div>
        )}
      </div>
      {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
    </div>
  );
}
