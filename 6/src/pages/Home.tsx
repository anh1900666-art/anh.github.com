import { useState, useEffect } from "react";
import { Search, Filter, PlayCircle } from "lucide-react";
import MediaDetailModal from "../components/MediaDetailModal";

export default function Home() {
  const [media, setMedia] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMedia();

    const handleMediaUploaded = () => {
      fetchMedia();
    };

    window.addEventListener('mediaUploaded', handleMediaUploaded);
    return () => {
      window.removeEventListener('mediaUploaded', handleMediaUploaded);
    };
  }, [search]);

  const fetchMedia = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/media?search=${search}`);
      const data = await res.json();
      setMedia(data);
    } catch (error) {
      console.error("Failed to fetch media", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (id: number) => {
    setMedia(media.filter((m) => m.id !== id));
    setSelectedMedia(null);
  };

  const handleUpdate = (updatedMedia: any) => {
    setMedia(media.map((m) => m.id === updatedMedia.id ? updatedMedia : m));
    setSelectedMedia(updatedMedia);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">All</h1>

        <div className="flex items-center gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search photos..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2.5 w-64 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-shadow"
            />
          </div>
          <button className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <Filter size={20} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
        </div>
      ) : media.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
          <div className="w-24 h-24 mb-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <Search size={40} className="text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">Không có ảnh nào</h3>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 auto-rows-[200px]">
          {media.map((item) => {
            const isVideo = item.mime_type.startsWith("video/");
            return (
              <div
                key={item.id}
                onClick={() => setSelectedMedia(item)}
                className="group relative rounded-2xl overflow-hidden cursor-pointer bg-gray-100 dark:bg-gray-800 shadow-sm hover:shadow-md transition-all duration-300"
              >
                {isVideo ? (
                  <div className="w-full h-full relative">
                    <video
                      src={`/api/media/${item.id}/file`}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                      <PlayCircle size={48} className="text-white opacity-80 group-hover:opacity-100 group-hover:scale-110 transition-all" />
                    </div>
                  </div>
                ) : (
                  <img
                    src={`/api/media/${item.id}/file`}
                    alt={item.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                )}
                
                {/* Overlay gradient */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                
                {/* Info on hover */}
                <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                  <p className="text-white font-medium truncate text-sm">{item.name}</p>
                  {item.album_name && (
                    <p className="text-white/80 text-xs mt-1 truncate">{item.album_name}</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedMedia && (
        <MediaDetailModal
          media={selectedMedia}
          onClose={() => setSelectedMedia(null)}
          onDelete={handleDelete}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}
