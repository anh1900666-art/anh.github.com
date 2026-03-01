import { useState, useEffect } from "react";
import { Search, Image as ImageIcon, Loader2, AlertCircle } from "lucide-react";
import DriveDetailModal from "../components/DriveDetailModal";

export default function DriveFolder() {
  const [folderId, setFolderId] = useState("1dPMJU5GlXe3aSb4xf1UAJ0CuWDgfa-FU");
  const [images, setImages] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchImages(folderId);
  }, []);

  const fetchImages = async (id: string) => {
    setLoading(true);
    setSearched(true);
    setImages([]);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/drive/files?folderId=${id}`);
      if (res.ok) {
        const data = await res.json();
        setImages(data);
      } else {
        const errData = await res.json().catch(() => null);
        setErrorMsg(errData?.error || "Lỗi không xác định từ máy chủ.");
        console.error("Failed to fetch drive files");
      }
    } catch (error: any) {
      setErrorMsg("Lỗi kết nối đến máy chủ.");
      console.error("Error fetching drive files:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : errorMsg ? (
        <div className="flex-1 flex flex-col items-center justify-center text-red-500">
          <AlertCircle size={48} className="mb-4" />
          <h3 className="text-xl font-medium mb-2">Đã xảy ra lỗi</h3>
          <p className="text-center max-w-md">{errorMsg}</p>
          <p className="text-center max-w-md mt-4 text-sm text-gray-500 dark:text-gray-400">
            Hãy kiểm tra lại biến môi trường trên Render hoặc quyền truy cập của thư mục Google Drive.
          </p>
        </div>
      ) : searched && images.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
          <div className="w-24 h-24 mb-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <ImageIcon size={40} className="text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">No images found</h3>
          <p>Check the Folder ID or permissions.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 auto-rows-[200px]">
          {images.map((item) => (
            <div
              key={item.id}
              onClick={() => setSelectedMedia(item)}
              className="group relative rounded-2xl overflow-hidden bg-gray-100 dark:bg-gray-800 shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer"
            >
              <img
                src={`/api/drive/stream/${item.id}`}
                alt={item.name}
                loading="lazy"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              
              <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                <p className="text-white font-medium truncate text-sm">{item.name}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedMedia && (
        <DriveDetailModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
        />
      )}
    </div>
  );
}
