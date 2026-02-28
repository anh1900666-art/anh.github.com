import React, { useState, useEffect } from "react";
import { Folder, Plus, Trash2, Image as ImageIcon, PlayCircle } from "lucide-react";
import MediaDetailModal from "../components/MediaDetailModal";
import ConfirmModal from "../components/ConfirmModal";

export default function Albums() {
  const [albums, setAlbums] = useState<any[]>([]);
  const [media, setMedia] = useState<any[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<any>(null);
  const [newAlbumName, setNewAlbumName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [albumToDelete, setAlbumToDelete] = useState<number | null>(null);

  useEffect(() => {
    fetchAlbums();

    const handleMediaUploaded = () => {
      fetchAlbums();
    };

    window.addEventListener('mediaUploaded', handleMediaUploaded);
    return () => {
      window.removeEventListener('mediaUploaded', handleMediaUploaded);
    };
  }, []);

  useEffect(() => {
    if (selectedAlbum) {
      fetchMedia(selectedAlbum.id);
    }

    const handleMediaUploaded = () => {
      if (selectedAlbum) {
        fetchMedia(selectedAlbum.id);
      }
    };

    window.addEventListener('mediaUploaded', handleMediaUploaded);
    return () => {
      window.removeEventListener('mediaUploaded', handleMediaUploaded);
    };
  }, [selectedAlbum]);

  const fetchAlbums = async () => {
    const res = await fetch("/api/albums");
    const data = await res.json();
    setAlbums(data);
  };

  const fetchMedia = async (albumId: number | string) => {
    let url = `/api/media`;
    if (albumId !== 'all') {
      url += `?album_id=${albumId}`;
    }
    const res = await fetch(url);
    const data = await res.json();
    setMedia(data);
  };

  const handleCreateAlbum = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAlbumName.trim()) return;

    try {
      const res = await fetch("/api/albums", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newAlbumName }),
      });
      if (res.ok) {
        setNewAlbumName("");
        setIsCreating(false);
        fetchAlbums();
      }
    } catch (error) {
      console.error("Failed to create album", error);
    }
  };

  const handleDeleteAlbum = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setAlbumToDelete(id);
  };

  const confirmDeleteAlbum = async () => {
    if (albumToDelete !== null) {
      await fetch(`/api/albums/${albumToDelete}`, { method: "DELETE" });
      if (selectedAlbum?.id === albumToDelete) setSelectedAlbum(null);
      fetchAlbums();
      setAlbumToDelete(null);
    }
  };

  const handleDeleteMedia = (id: number) => {
    setMedia(media.filter((m) => m.id !== id));
    setSelectedMedia(null);
  };

  const handleUpdateMedia = (updatedMedia: any) => {
    // If the album was changed to something else, remove it from the current album view
    if (updatedMedia.album_id !== selectedAlbum?.id) {
      setMedia(media.filter((m) => m.id !== updatedMedia.id));
      setSelectedMedia(null);
    } else {
      setMedia(media.map((m) => m.id === updatedMedia.id ? updatedMedia : m));
      setSelectedMedia(updatedMedia);
    }
  };

  if (selectedAlbum) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => setSelectedAlbum(null)}
            className="text-gray-500 hover:text-gray-900 dark:hover:text-white transition-colors"
          >
            &larr; Back to Albums
          </button>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">
            {selectedAlbum.name}
          </h1>
        </div>

        {media.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="w-24 h-24 mb-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
              <ImageIcon size={40} className="text-gray-400 dark:text-gray-500" />
            </div>
            <h3 className="text-xl font-medium text-gray-900 dark:text-white mb-2">Album is empty</h3>
            <p>Upload some photos and add them to this album.</p>
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
                  
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div className="absolute bottom-0 left-0 right-0 p-4 translate-y-4 group-hover:translate-y-0 opacity-0 group-hover:opacity-100 transition-all duration-300">
                    <p className="text-white font-medium truncate text-sm">{item.name}</p>
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
            onDelete={handleDeleteMedia}
            onUpdate={handleUpdateMedia}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white tracking-tight">Albums</h1>
        <button
          onClick={() => setIsCreating(true)}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
        >
          <Plus size={20} />
          New Album
        </button>
      </div>

      {isCreating && (
        <form onSubmit={handleCreateAlbum} className="mb-8 p-6 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Create New Album</h3>
          <div className="flex gap-4">
            <input
              type="text"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder="Album Name"
              className="flex-1 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2.5 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              autoFocus
            />
            <button
              type="button"
              onClick={() => setIsCreating(false)}
              className="px-5 py-2.5 rounded-xl font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newAlbumName.trim()}
              className="px-5 py-2.5 rounded-xl font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        {albums.map((album) => (
          <div
            key={album.id}
            onClick={() => setSelectedAlbum(album)}
            className="group bg-white dark:bg-gray-900 rounded-2xl p-6 shadow-sm hover:shadow-md border border-gray-100 dark:border-gray-800 cursor-pointer transition-all hover:-translate-y-1"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Folder size={24} />
              </div>
              <button
                onClick={(e) => handleDeleteAlbum(album.id, e)}
                className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-full transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 size={18} />
              </button>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {album.name}
            </h3>
          </div>
        ))}
      </div>

      {albumToDelete !== null && (
        <ConfirmModal
          title="Xóa Album"
          message="Bạn có chắc muốn xóa album này không? Các ảnh/video bên trong sẽ không bị xóa khỏi hệ thống, nhưng sẽ bị gỡ khỏi album này."
          onConfirm={confirmDeleteAlbum}
          onCancel={() => setAlbumToDelete(null)}
        />
      )}
    </div>
  );
}
