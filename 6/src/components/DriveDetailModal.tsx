import { X, Download } from "lucide-react";

export default function DriveDetailModal({ media, onClose }: any) {
  const isVideo = media.mimeType.startsWith("video/");

  const handleDownload = () => {
    // Direct Google Drive download link
    const url = `https://drive.google.com/uc?export=download&id=${media.id}`;
    
    // Create a hidden iframe to trigger the download without opening a new tab
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    iframe.src = url;
    document.body.appendChild(iframe);
    
    // Remove the iframe after a short delay
    setTimeout(() => {
      document.body.removeChild(iframe);
    }, 2000);
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8"
      onClick={onClose}
    >
      <div className="absolute top-6 right-6 flex gap-4 z-50">
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload(); }}
          className="p-3 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors"
          title="Tải xuống (Gốc)"
        >
          <Download size={24} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onClose(); }}
          className="p-3 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full transition-colors"
          title="Đóng"
        >
          <X size={24} />
        </button>
      </div>

      <div 
        className="relative max-w-full max-h-full flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {isVideo ? (
          <video
            src={`/api/drive/stream/${media.id}`}
            controls
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <img
            src={`/api/drive/stream/${media.id}`}
            alt={media.name}
            className="max-w-[95vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        )}
      </div>
    </div>
  );
}
