'use client';
import { useState, useCallback } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import VideoUploader from './VideoUploader';
import { apiFetch } from '@/lib/api';

export interface PlaylistItem {
  key: string;
  name: string;
  url: string;
}

interface Props {
  streamId: string;
  initialPlaylist: PlaylistItem[];
  loop?: boolean;
  onPlaylistChange?: (playlist: PlaylistItem[]) => void;
}

function SortableItem({
  item,
  index,
  total,
  saving,
  onMove,
  onRemove,
}: {
  item: PlaylistItem;
  index: number;
  total: number;
  saving: boolean;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 bg-slate-700 rounded-lg px-3 py-2.5"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing p-0.5 touch-none"
        title="Drag to reorder"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="5" r="1" fill="currentColor" />
          <circle cx="15" cy="5" r="1" fill="currentColor" />
          <circle cx="9" cy="12" r="1" fill="currentColor" />
          <circle cx="15" cy="12" r="1" fill="currentColor" />
          <circle cx="9" cy="19" r="1" fill="currentColor" />
          <circle cx="15" cy="19" r="1" fill="currentColor" />
        </svg>
      </button>

      <span className="text-xs text-gray-500 w-5 text-right shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.name}</p>
      </div>
      <div className="flex gap-1 shrink-0">
        <button
          disabled={index === 0 || saving}
          onClick={() => onMove(index, -1)}
          className="text-gray-400 hover:text-white disabled:opacity-30 px-1.5 py-1 text-xs rounded hover:bg-slate-600 transition"
          title="Move up"
        >
          ↑
        </button>
        <button
          disabled={index === total - 1 || saving}
          onClick={() => onMove(index, 1)}
          className="text-gray-400 hover:text-white disabled:opacity-30 px-1.5 py-1 text-xs rounded hover:bg-slate-600 transition"
          title="Move down"
        >
          ↓
        </button>
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-purple-400 px-1.5 py-1 text-xs rounded hover:bg-slate-600 transition"
          title="Preview"
        >
          ▶
        </a>
        <button
          disabled={saving}
          onClick={() => onRemove(index)}
          className="text-gray-400 hover:text-red-400 disabled:opacity-30 px-1.5 py-1 text-xs rounded hover:bg-slate-600 transition"
          title="Remove"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function DragOverlayItem({ item, index }: { item: PlaylistItem; index: number }) {
  return (
    <div className="flex items-center gap-3 bg-slate-600 rounded-lg px-3 py-2.5 shadow-xl shadow-black/40 border border-purple-500/30 scale-[1.02]">
      <span className="text-gray-500 p-0.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="5" r="1" fill="currentColor" />
          <circle cx="15" cy="5" r="1" fill="currentColor" />
          <circle cx="9" cy="12" r="1" fill="currentColor" />
          <circle cx="15" cy="12" r="1" fill="currentColor" />
          <circle cx="9" cy="19" r="1" fill="currentColor" />
          <circle cx="15" cy="19" r="1" fill="currentColor" />
        </svg>
      </span>
      <span className="text-xs text-gray-400 w-5 text-right shrink-0">{index + 1}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{item.name}</p>
      </div>
    </div>
  );
}

export default function PlaylistManager({ streamId, initialPlaylist, onPlaylistChange }: Props) {
  const [playlist, setPlaylist] = useState<PlaylistItem[]>(initialPlaylist);
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  async function savePlaylist(next: PlaylistItem[]) {
    setSaving(true);
    try {
      await apiFetch(`/api/streams/${streamId}/playlist`, {
        method: 'PUT',
        body: JSON.stringify({ playlist: next }),
      });
      setPlaylist(next);
      onPlaylistChange?.(next);
    } catch (err: any) {
      alert(err.message || 'Failed to save playlist');
    } finally {
      setSaving(false);
    }
  }

  async function handleUploaded(video: { key: string; name: string; url: string }) {
    setSaving(true);
    try {
      const { playlist: updated } = await apiFetch(`/api/streams/${streamId}/playlist`, {
        method: 'POST',
        body: JSON.stringify(video),
      });
      setPlaylist(updated);
      onPlaylistChange?.(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to add video');
    } finally {
      setSaving(false);
    }
  }

  function move(index: number, direction: -1 | 1) {
    const next = [...playlist];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    savePlaylist(next);
  }

  function remove(index: number) {
    savePlaylist(playlist.filter((_, i) => i !== index));
  }

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = playlist.findIndex(item => item.key === active.id);
    const newIndex = playlist.findIndex(item => item.key === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(playlist, oldIndex, newIndex);
    savePlaylist(reordered);
  }, [playlist, streamId]);

  const activeItem = activeId ? playlist.find(item => item.key === activeId) : null;
  const activeIndex = activeId ? playlist.findIndex(item => item.key === activeId) : -1;

  return (
    <div className="space-y-4">
      <VideoUploader onUploaded={handleUploaded} />

      {playlist.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={playlist.map(i => i.key)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {playlist.map((item, i) => (
                <SortableItem
                  key={item.key}
                  item={item}
                  index={i}
                  total={playlist.length}
                  saving={saving}
                  onMove={move}
                  onRemove={remove}
                />
              ))}
            </div>
          </SortableContext>
          <DragOverlay>
            {activeItem && activeIndex !== -1 ? (
              <DragOverlayItem item={activeItem} index={activeIndex} />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {playlist.length === 0 && (
        <p className="text-xs text-gray-500 text-center py-2">
          No videos yet. Upload one to create a playlist for pre-recorded streaming.
        </p>
      )}
    </div>
  );
}
