const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  generateSummary: (content, type) => ipcRenderer.invoke('generate-summary', content, type),
  generateFlashcards: (content) => ipcRenderer.invoke('generate-flashcards', content),
  generateQuiz: (content) => ipcRenderer.invoke('generate-quiz', content),
  exportFile: (opts) => ipcRenderer.invoke('export-file', opts),
  hasApiKey: () => ipcRenderer.invoke('has-api-key'),
  setApiKey: (key) => ipcRenderer.invoke('set-api-key', key),
});
