import { createContext, useContext, useState, ReactNode } from 'react';

interface SelectedSongsContextType {
  selectedSongIds: Set<string>;
  toggleSongSelection: (songId: string) => void;
  clearSelection: () => void;
}

const SelectedSongsContext = createContext<SelectedSongsContextType | undefined>(undefined);

export function SelectedSongsProvider({ children }: { children: ReactNode }) {
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());

  const toggleSongSelection = (songId: string) => {
    setSelectedSongIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(songId)) {
        newSet.delete(songId);
      } else {
        newSet.add(songId);
      }
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedSongIds(new Set());
  };

  return (
    <SelectedSongsContext.Provider value={{ selectedSongIds, toggleSongSelection, clearSelection }}>
      {children}
    </SelectedSongsContext.Provider>
  );
}

export function useSelectedSongs() {
  const context = useContext(SelectedSongsContext);
  if (!context) {
    throw new Error('useSelectedSongs must be used within SelectedSongsProvider');
  }
  return context;
}