/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

import {GoogleGenAI} from '@google/genai';
import {marked} from 'marked';

const MODEL_NAME = 'gemini-2.5-flash';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const DRIVE_API_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FOLDER_NAME = 'Voice Notes';

declare global {
  interface Window {
    gapi: any;
    google: any;
    tokenClient: any;
  }
}
interface Note {
  id: string; // Base filename
  title: string;
  createdTime: number;
  markdownFileId: string;
  audioFileId: string;
  rawTranscription?: string;
  polishedNote?: string;
}

class VoiceNotesApp {
  private genAI: any;
  private mediaRecorder: MediaRecorder | null = null;
  private recordButton: HTMLButtonElement;
  private recordingStatus: HTMLDivElement;
  private rawTranscription: HTMLDivElement;
  private polishedNote: HTMLDivElement;
  private newButton: HTMLButtonElement;
  private themeToggleButton: HTMLButtonElement;
  private themeToggleIcon: HTMLElement;
  private audioChunks: Blob[] = [];
  private isRecording = false;
  private currentNote: Partial<Note> & {id: string} | null = null;
  private stream: MediaStream | null = null;
  private editorTitle: HTMLDivElement;
  private talkingPoints: HTMLTextAreaElement;

  private recordingInterface: HTMLDivElement;
  private liveRecordingTitle: HTMLDivElement;
  private liveWaveformCanvas: HTMLCanvasElement | null;
  private liveWaveformCtx: CanvasRenderingContext2D | null = null;
  private liveRecordingTimerDisplay: HTMLDivElement;
  private statusIndicatorDiv: HTMLDivElement | null;

  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private waveformDataArray: Uint8Array | null = null;
  private waveformDrawingId: number | null = null;
  private timerIntervalId: number | null = null;
  private recordingStartTime: number = 0;

  private playButton: HTMLButtonElement;
  private playButtonIcon: HTMLElement;
  private lastAudioBlob: Blob | null = null;
  private audioPlayer: HTMLAudioElement | null = null;
  private isPlaying = false;

  private saveButton: HTMLButtonElement;
  private signInButton: HTMLButtonElement;
  private signOutButton: HTMLButtonElement;
  private userStatusDiv: HTMLDivElement;
  private userNameSpan: HTMLSpanElement;
  private isGapiLoaded = false;
  private isGisLoaded = false;
  private isSignedIn = false;

  // New multi-view elements
  private loginView: HTMLDivElement;
  private appView: HTMLDivElement;
  private noteLibraryView: HTMLDivElement;
  private noteEditorView: HTMLDivElement;
  private notesListContainer: HTMLDivElement;
  private notesListSpinner: HTMLDivElement;
  private emptyLibraryMessage: HTMLParagraphElement;
  private newNoteFromLibraryButton: HTMLButtonElement;
  private backToLibraryButton: HTMLButtonElement;
  private notesList: HTMLDivElement;
  
  // Delete modal elements
  private deleteModal: HTMLDivElement;
  private cancelDeleteButton: HTMLButtonElement;
  private confirmDeleteButton: HTMLButtonElement;
  private noteToDelete: Note | null = null;
  
  private libraryAudioPlayer: HTMLAudioElement;

  constructor() {
    this.genAI = new GoogleGenAI({apiKey: process.env.API_KEY!});

    // Views
    this.loginView = document.getElementById('login-view') as HTMLDivElement;
    this.appView = document.getElementById('app-view') as HTMLDivElement;
    this.noteLibraryView = document.getElementById('note-library-view') as HTMLDivElement;
    this.noteEditorView = document.getElementById('note-editor-view') as HTMLDivElement;
    
    // Auth
    this.signInButton = document.getElementById('signInButton') as HTMLButtonElement;
    this.signOutButton = document.getElementById('signOutButton') as HTMLButtonElement;
    this.userStatusDiv = document.getElementById('userStatus') as HTMLDivElement;
    this.userNameSpan = document.getElementById('userName') as HTMLSpanElement;
    
    // Library
    this.notesListContainer = document.getElementById('notes-list-container') as HTMLDivElement;
    this.notesList = document.getElementById('notes-list') as HTMLDivElement;
    this.notesListSpinner = document.getElementById('notes-list-spinner') as HTMLDivElement;
    this.emptyLibraryMessage = document.getElementById('empty-library-message') as HTMLParagraphElement;
    this.newNoteFromLibraryButton = document.getElementById('newNoteFromLibraryButton') as HTMLButtonElement;
    
    // Editor
    this.recordButton = document.getElementById('recordButton') as HTMLButtonElement;
    this.recordingStatus = document.getElementById('recordingStatus') as HTMLDivElement;
    this.rawTranscription = document.getElementById('rawTranscription') as HTMLDivElement;
    this.polishedNote = document.getElementById('polishedNote') as HTMLDivElement;
    this.newButton = document.getElementById('newButton') as HTMLButtonElement;
    this.themeToggleButton = document.getElementById('themeToggleButton') as HTMLButtonElement;
    this.themeToggleIcon = this.themeToggleButton.querySelector('i') as HTMLElement;
    this.editorTitle = document.querySelector('.editor-title') as HTMLDivElement;
    this.talkingPoints = document.getElementById('talkingPoints') as HTMLTextAreaElement;
    this.playButton = document.getElementById('playButton') as HTMLButtonElement;
    this.playButtonIcon = this.playButton.querySelector('i') as HTMLElement;
    this.saveButton = document.getElementById('saveButton') as HTMLButtonElement;
    this.backToLibraryButton = document.getElementById('backToLibraryButton') as HTMLButtonElement;
    
    // Live Recording UI
    this.recordingInterface = document.querySelector('.recording-interface') as HTMLDivElement;
    this.liveRecordingTitle = document.getElementById('liveRecordingTitle') as HTMLDivElement;
    this.liveWaveformCanvas = document.getElementById('liveWaveformCanvas') as HTMLCanvasElement;
    this.liveRecordingTimerDisplay = document.getElementById('liveRecordingTimerDisplay') as HTMLDivElement;

    if (this.liveWaveformCanvas) this.liveWaveformCtx = this.liveWaveformCanvas.getContext('2d');
    if (this.recordingInterface) this.statusIndicatorDiv = this.recordingInterface.querySelector('.status-indicator') as HTMLDivElement;
    
    // Delete Modal
    this.deleteModal = document.getElementById('delete-modal') as HTMLDivElement;
    this.cancelDeleteButton = document.getElementById('cancel-delete') as HTMLButtonElement;
    this.confirmDeleteButton = document.getElementById('confirm-delete') as HTMLButtonElement;

    this.libraryAudioPlayer = new Audio();
    
    this.bindEventListeners();
    this.initTheme();
    this.initializeGoogleClients();
  }

  private bindEventListeners(): void {
    // Auth
    this.signInButton.addEventListener('click', () => this.handleSignIn());
    this.signOutButton.addEventListener('click', () => this.handleSignOut());
    
    // Navigation
    this.newNoteFromLibraryButton.addEventListener('click', () => this.switchToView('editor-new'));
    this.backToLibraryButton.addEventListener('click', () => this.switchToView('library'));

    // Editor
    this.recordButton.addEventListener('click', () => this.toggleRecording());
    this.newButton.addEventListener('click', () => this.createNewNote());
    this.themeToggleButton.addEventListener('click', () => this.toggleTheme());
    this.playButton.addEventListener('click', () => this.togglePlayback());
    this.saveButton.addEventListener('click', () => this.handleSaveToDrive());
    window.addEventListener('resize', this.handleResize.bind(this));
    
    // Delete Modal
    this.cancelDeleteButton.addEventListener('click', () => this.closeDeleteModal());
    this.confirmDeleteButton.addEventListener('click', () => this.executeDelete());
    this.deleteModal.addEventListener('click', (e) => {
        if (e.target === this.deleteModal) this.closeDeleteModal();
    });
  }
  
  private switchToView(view: 'login' | 'library' | 'editor-new' | 'editor-existing'): void {
    this.loginView.classList.add('hidden');
    this.appView.classList.add('hidden');
    this.noteLibraryView.classList.add('hidden');
    this.noteEditorView.classList.add('hidden');

    switch(view) {
        case 'login':
            this.loginView.classList.remove('hidden');
            break;
        case 'library':
            this.appView.classList.remove('hidden');
            this.noteLibraryView.classList.remove('hidden');
            this.loadNotesFromDrive();
            break;
        case 'editor-new':
            this.appView.classList.remove('hidden');
            this.noteEditorView.classList.remove('hidden');
            this.createNewNote();
            break;
        case 'editor-existing':
             this.appView.classList.remove('hidden');
             this.noteEditorView.classList.remove('hidden');
             // Note data should be loaded before this is called
             break;
    }
  }

  private initializeGoogleClients(): void {
    const gapiScript = document.querySelector('script[src="https://apis.google.com/js/api.js"]') as HTMLScriptElement;
    gapiScript!.onload = () => {
      window.gapi.load('client', () => {
        this.isGapiLoaded = true;
        this.tryInitGapiClient();
      });
    };

    const gisScript = document.querySelector('script[src="https://accounts.google.com/gsi/client"]') as HTMLScriptElement;
    gisScript!.onload = () => {
      this.isGisLoaded = true;
      this.tryInitGisClient();
    };
  }

  private tryInitGapiClient(): void {
    if (this.isGapiLoaded) {
      window.gapi.client.init({}).then(() => {
        window.gapi.client.load('https://www.googleapis.com/discovery/v1/apis/drive/v3/rest');
      });
    }
  }

  private tryInitGisClient(): void {
    if (this.isGisLoaded && GOOGLE_CLIENT_ID) {
      window.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: DRIVE_API_SCOPE,
        callback: (tokenResponse: any) => {
          if (tokenResponse && tokenResponse.access_token) {
            this.updateUiForAuthState(true);
          }
        },
      });
    } else if (!GOOGLE_CLIENT_ID) {
      console.error("Google Client ID is not configured.");
      this.signInButton.textContent = 'Google Client ID missing';
      this.signInButton.disabled = true;
    }
  }

  private handleSignIn(): void {
    if (window.tokenClient) {
      window.tokenClient.requestAccessToken({prompt: 'consent'});
    }
  }

  private handleSignOut(): void {
    const token = window.gapi.client.getToken();
    if (token) {
      window.google.accounts.oauth2.revoke(token.access_token, () => {
        window.gapi.client.setToken(null);
        this.updateUiForAuthState(false);
      });
    }
  }

  private async updateUiForAuthState(signedIn: boolean): Promise<void> {
    this.isSignedIn = signedIn;
    if (signedIn) {
      try {
        const res = await window.gapi.client.request({
          path: 'https://www.googleapis.com/oauth2/v3/userinfo',
        });
        this.userNameSpan.textContent = `Hi, ${res.result.given_name}`;
      } catch (e) {
        this.userNameSpan.textContent = `Signed In`;
      }
      this.switchToView('library');
    } else {
      this.userNameSpan.textContent = '';
      this.switchToView('login');
    }
  }

  private updateSaveButtonState(): void {
    const hasContent = !!this.lastAudioBlob && this.polishedNote.innerText.trim() !== '' && !this.polishedNote.classList.contains('placeholder-active');
    this.saveButton.disabled = !hasContent || !this.isSignedIn;
  }

  private handleResize(): void {
    if (this.isRecording && this.liveWaveformCanvas && this.liveWaveformCanvas.style.display === 'block') {
      requestAnimationFrame(() => this.setupCanvasDimensions());
    }
  }

  private setupCanvasDimensions(): void {
    if (!this.liveWaveformCanvas || !this.liveWaveformCtx) return;
    const canvas = this.liveWaveformCanvas;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    this.liveWaveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      document.body.classList.add('light-mode');
      this.themeToggleIcon.classList.replace('fa-sun', 'fa-moon');
    } else {
      document.body.classList.remove('light-mode');
      this.themeToggleIcon.classList.replace('fa-moon', 'fa-sun');
    }
  }

  private toggleTheme(): void {
    document.body.classList.toggle('light-mode');
    if (document.body.classList.contains('light-mode')) {
      localStorage.setItem('theme', 'light');
      this.themeToggleIcon.classList.replace('fa-sun', 'fa-moon');
    } else {
      localStorage.setItem('theme', 'dark');
      this.themeToggleIcon.classList.replace('fa-moon', 'fa-sun');
    }
  }
    
  // NOTE LIBRARY METHODS
  private async loadNotesFromDrive() {
    this.notesList.innerHTML = '';
    this.notesListSpinner.classList.remove('hidden');
    this.emptyLibraryMessage.classList.add('hidden');
    try {
        const folderId = await this.findOrCreateDriveFolder();
        const response = await window.gapi.client.drive.files.list({
            q: `'${folderId}' in parents and trashed=false`,
            fields: 'files(id, name, createdTime)',
            orderBy: 'createdTime desc',
        });
        const files = response.result.files || [];
        const groupedNotes = new Map<string, Partial<Note>>();
        
        files.forEach(file => {
            const isMarkdown = file.name.endsWith('.md');
            const isAudio = file.name.endsWith('.webm');
            if (!isMarkdown && !isAudio) return;

            const baseName = file.name.replace(/\.md$|\.webm$/, '');
            if (!groupedNotes.has(baseName)) {
                groupedNotes.set(baseName, { 
                  id: baseName,
                  createdTime: new Date(file.createdTime).getTime()
                });
            }
            const note = groupedNotes.get(baseName)!;
            if (isMarkdown) {
                note.markdownFileId = file.id;
                note.title = baseName.split(' - ')[0];
            } else if (isAudio) {
                note.audioFileId = file.id;
            }
        });

        const notes: Note[] = Array.from(groupedNotes.values())
            .filter(n => n.markdownFileId && n.audioFileId) as Note[];

        this.renderNotes(notes);

    } catch (error) {
        console.error('Error loading notes from Drive:', error);
        this.notesList.innerHTML = '<p class="empty-message">Could not load notes.</p>';
    } finally {
        this.notesListSpinner.classList.add('hidden');
    }
  }

  private renderNotes(notes: Note[]) {
    this.notesList.innerHTML = '';
    if (notes.length === 0) {
        this.emptyLibraryMessage.classList.remove('hidden');
        return;
    }
    this.emptyLibraryMessage.classList.add('hidden');
    
    notes.forEach(note => {
        const card = document.createElement('div');
        card.className = 'note-card';
        card.innerHTML = `
            <div class="note-card-title">${note.title}</div>
            <div class="note-card-date">${new Date(note.createdTime).toLocaleString()}</div>
            <div class="note-card-actions">
                <button class="action-button play-note-button" title="Play Audio">
                    <i class="fas fa-play"></i>
                </button>
                <div>
                  <button class="action-button open-note-button" title="Open Note">
                      <i class="fas fa-edit"></i>
                  </button>
                  <button class="action-button delete-note-button" title="Delete Note">
                      <i class="fas fa-trash"></i>
                  </button>
                </div>
            </div>
        `;
        this.notesList.appendChild(card);
        
        card.querySelector('.play-note-button')!.addEventListener('click', (e) => {
          e.stopPropagation();
          this.playNoteFromLibrary(note.audioFileId, card.querySelector('.play-note-button i')!);
        });
        card.querySelector('.delete-note-button')!.addEventListener('click', (e) => {
          e.stopPropagation();
          this.promptDelete(note);
        });
        card.querySelector('.open-note-button')!.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openNoteInEditor(note);
        });
        card.querySelector('.note-card-title')!.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openNoteInEditor(note);
        });
    });
  }
  
  private async playNoteFromLibrary(audioFileId: string, icon: HTMLElement) {
      if (this.libraryAudioPlayer.src && !this.libraryAudioPlayer.paused) {
          this.libraryAudioPlayer.pause();
          return;
      }
      
      const accessToken = window.gapi.client.getToken().access_token;
      const fileUrl = `https://www.googleapis.com/drive/v3/files/${audioFileId}?alt=media`;
      
      const currentlyPlaying = document.querySelector('.fa-pause');
      if(currentlyPlaying) currentlyPlaying.classList.replace('fa-pause', 'fa-play');

      icon.classList.replace('fa-play', 'fa-spinner');
      icon.classList.add('fa-spin');

      try {
        const response = await fetch(fileUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error('Failed to fetch audio file.');

        const blob = await response.blob();
        const objectURL = URL.createObjectURL(blob);

        this.libraryAudioPlayer.src = objectURL;
        this.libraryAudioPlayer.onplay = () => icon.classList.replace('fa-play', 'fa-pause');
        this.libraryAudioPlayer.onpause = () => icon.classList.replace('fa-pause', 'fa-play');
        this.libraryAudioPlayer.onended = () => {
          icon.classList.replace('fa-pause', 'fa-play');
          URL.revokeObjectURL(objectURL);
        };
        this.libraryAudioPlayer.play();
      } catch (error) {
        console.error("Error playing audio:", error);
        icon.classList.replace('fa-spinner', 'fa-play');
      } finally {
        icon.classList.remove('fa-spin');
      }
  }
  
  private async openNoteInEditor(note: Note) {
    this.createNewNote(); // Reset editor state
    this.currentNote = { ...note };
    this.editorTitle.textContent = note.title;
    this.editorTitle.classList.remove('placeholder-active');
    
    this.switchToView('editor-existing');
    this.recordingStatus.textContent = 'Loading note...';
    
    try {
        const accessToken = window.gapi.client.getToken().access_token;
        const fetchOptions = { headers: { 'Authorization': `Bearer ${accessToken}` } };

        // Fetch audio
        const audioRes = await fetch(`https://www.googleapis.com/drive/v3/files/${note.audioFileId}?alt=media`, fetchOptions);
        this.lastAudioBlob = await audioRes.blob();
        this.playButton.disabled = false;
        
        // Fetch markdown content
        const mdRes = await fetch(`https://www.googleapis.com/drive/v3/files/${note.markdownFileId}?alt=media`, fetchOptions);
        const mdContent = await mdRes.text();
        this.currentNote.polishedNote = mdContent;
        this.polishedNote.innerHTML = await marked.parse(mdContent);
        this.polishedNote.classList.remove('placeholder-active');
        
        // Cannot reconstruct raw transcription, so we'll leave it blank
        this.rawTranscription.textContent = "Raw transcription is not saved. Re-process audio if needed.";
        this.rawTranscription.classList.remove('placeholder-active');

        this.recordingStatus.textContent = 'Note loaded successfully.';
        this.updateSaveButtonState();
    } catch(err) {
        console.error("Failed to load note content", err);
        this.recordingStatus.textContent = 'Error loading note.';
        this.switchToView('library');
    }
  }

  private promptDelete(note: Note) {
    this.noteToDelete = note;
    this.deleteModal.classList.remove('hidden');
  }

  private closeDeleteModal() {
    this.noteToDelete = null;
    this.deleteModal.classList.add('hidden');
  }

  private async executeDelete() {
    if (!this.noteToDelete) return;
    const note = this.noteToDelete;
    this.confirmDeleteButton.disabled = true;
    this.confirmDeleteButton.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Deleting...`;
    
    try {
        await window.gapi.client.drive.files.delete({ fileId: note.markdownFileId });
        await window.gapi.client.drive.files.delete({ fileId: note.audioFileId });
        this.closeDeleteModal();
        this.loadNotesFromDrive(); // Refresh the list
    } catch (error) {
        console.error("Error deleting note:", error);
        // Handle error display
    } finally {
        this.confirmDeleteButton.disabled = false;
        this.confirmDeleteButton.innerHTML = 'Delete';
    }
  }


  // EDITOR METHODS
  private async toggleRecording(): Promise<void> {
    if (!this.isRecording) await this.startRecording();
    else await this.stopRecording();
  }

  private setupAudioVisualizer(): void {
    if (!this.stream || this.audioContext) return;
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = 256;
    this.analyserNode.smoothingTimeConstant = 0.75;
    const bufferLength = this.analyserNode.frequencyBinCount;
    this.waveformDataArray = new Uint8Array(bufferLength);
    source.connect(this.analyserNode);
  }

  private drawLiveWaveform(): void {
    if (!this.analyserNode || !this.waveformDataArray || !this.liveWaveformCtx || !this.liveWaveformCanvas || !this.isRecording) {
      if (this.waveformDrawingId) cancelAnimationFrame(this.waveformDrawingId);
      this.waveformDrawingId = null;
      return;
    }
    this.waveformDrawingId = requestAnimationFrame(() => this.drawLiveWaveform());
    this.analyserNode.getByteFrequencyData(this.waveformDataArray);
    const ctx = this.liveWaveformCtx;
    const canvas = this.liveWaveformCanvas;
    const logicalWidth = canvas.clientWidth;
    const logicalHeight = canvas.clientHeight;
    ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    const bufferLength = this.analyserNode.frequencyBinCount;
    const numBars = Math.floor(bufferLength * 0.5);
    if (numBars === 0) return;
    const totalBarPlusSpacingWidth = logicalWidth / numBars;
    const barWidth = Math.max(1, Math.floor(totalBarPlusSpacingWidth * 0.7));
    const barSpacing = Math.max(0, Math.floor(totalBarPlusSpacingWidth * 0.3));
    let x = 0;
    const recordingColor = getComputedStyle(document.documentElement).getPropertyValue('--color-recording').trim() || '#ff3b30';
    ctx.fillStyle = recordingColor;
    for (let i = 0; i < numBars; i++) {
      if (x >= logicalWidth) break;
      const dataIndex = Math.floor(i * (bufferLength / numBars));
      const barHeightNormalized = this.waveformDataArray[dataIndex] / 255.0;
      let barHeight = barHeightNormalized * logicalHeight;
      if (barHeight < 1 && barHeight > 0) barHeight = 1;
      barHeight = Math.round(barHeight);
      const y = Math.round((logicalHeight - barHeight) / 2);
      ctx.fillRect(Math.floor(x), y, barWidth, barHeight);
      x += barWidth + barSpacing;
    }
  }

  private updateLiveTimer(): void {
    if (!this.isRecording || !this.liveRecordingTimerDisplay) return;
    const now = Date.now();
    const elapsedMs = now - this.recordingStartTime;
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const hundredths = Math.floor((elapsedMs % 1000) / 10);
    this.liveRecordingTimerDisplay.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
  }

  private startLiveDisplay(): void {
    if (!this.recordingInterface || !this.liveRecordingTitle || !this.liveWaveformCanvas || !this.liveRecordingTimerDisplay) return;
    this.recordingInterface.classList.add('is-live');
    this.liveRecordingTitle.style.display = 'block';
    this.liveWaveformCanvas.style.display = 'block';
    this.liveRecordingTimerDisplay.style.display = 'block';
    this.setupCanvasDimensions();
    if (this.statusIndicatorDiv) this.statusIndicatorDiv.style.display = 'none';
    const iconElement = this.recordButton.querySelector('.record-button-inner i') as HTMLElement;
    if (iconElement) iconElement.classList.replace('fa-microphone', 'fa-stop');
    const currentTitle = this.editorTitle.textContent?.trim();
    const placeholder = this.editorTitle.getAttribute('placeholder') || 'Untitled Note';
    this.liveRecordingTitle.textContent = (currentTitle && currentTitle !== placeholder) ? currentTitle : 'New Recording';
    this.setupAudioVisualizer();
    this.drawLiveWaveform();
    this.recordingStartTime = Date.now();
    this.updateLiveTimer();
    if (this.timerIntervalId) clearInterval(this.timerIntervalId);
    this.timerIntervalId = window.setInterval(() => this.updateLiveTimer(), 50);
  }

  private stopLiveDisplay(): void {
    if (!this.recordingInterface || !this.liveRecordingTitle || !this.liveWaveformCanvas || !this.liveRecordingTimerDisplay) {
      if (this.recordingInterface) this.recordingInterface.classList.remove('is-live');
      return;
    }
    this.recordingInterface.classList.remove('is-live');
    this.liveRecordingTitle.style.display = 'none';
    this.liveWaveformCanvas.style.display = 'none';
    this.liveRecordingTimerDisplay.style.display = 'none';
    if (this.statusIndicatorDiv) this.statusIndicatorDiv.style.display = 'block';
    const iconElement = this.recordButton.querySelector('.record-button-inner i') as HTMLElement;
    if (iconElement) iconElement.classList.replace('fa-stop', 'fa-microphone');
    if (this.waveformDrawingId) { cancelAnimationFrame(this.waveformDrawingId); this.waveformDrawingId = null; }
    if (this.timerIntervalId) { clearInterval(this.timerIntervalId); this.timerIntervalId = null; }
    if (this.liveWaveformCtx && this.liveWaveformCanvas) this.liveWaveformCtx.clearRect(0, 0, this.liveWaveformCanvas.width, this.liveWaveformCanvas.height);
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close().catch(e => console.warn('Error closing audio context', e));
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.waveformDataArray = null;
  }

  private async startRecording(): Promise<void> {
    if (this.isPlaying && this.audioPlayer) this.audioPlayer.pause();
    try {
      this.audioChunks = [];
      if (this.stream) this.stream.getTracks().forEach(track => track.stop());
      if (this.audioContext && this.audioContext.state !== 'closed') await this.audioContext.close();
      this.recordingStatus.textContent = 'Requesting microphone access...';
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({audio: true});
      } catch (err) {
        this.stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
      }
      try {
        this.mediaRecorder = new MediaRecorder(this.stream, {mimeType: 'audio/webm'});
      } catch (e) {
        this.mediaRecorder = new MediaRecorder(this.stream);
      }
      this.mediaRecorder.ondataavailable = (event) => { if (event.data && event.data.size > 0) this.audioChunks.push(event.data); };
      this.mediaRecorder.onstop = () => {
        this.stopLiveDisplay();
        if (this.audioChunks.length > 0) {
          const audioBlob = new Blob(this.audioChunks, {type: this.mediaRecorder?.mimeType || 'audio/webm'});
          this.processAudio(audioBlob).catch(err => {
            console.error('Error processing audio:', err);
            this.recordingStatus.textContent = 'Error processing recording';
          });
        } else {
          this.recordingStatus.textContent = 'No audio data captured. Please try again.';
        }
        if (this.stream) this.stream.getTracks().forEach(track => track.stop());
      };
      this.mediaRecorder.start();
      this.isRecording = true;
      this.recordButton.classList.add('recording');
      this.recordButton.setAttribute('title', 'Stop Recording');
      this.startLiveDisplay();
    } catch (error) {
      console.error('Error starting recording:', error);
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorName = error instanceof Error ? error.name : 'Unknown';
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') this.recordingStatus.textContent = 'Microphone permission denied. Please check browser settings.';
      else if (errorName === 'NotFoundError' || (errorName === 'DOMException' && errorMessage.includes('Requested device not found'))) this.recordingStatus.textContent = 'No microphone found. Please connect a microphone.';
      else if (errorName === 'NotReadableError' || errorName === 'AbortError' || (errorName === 'DOMException' && errorMessage.includes('Failed to allocate audiosource'))) this.recordingStatus.textContent = 'Cannot access microphone. It may be in use by another application.';
      else this.recordingStatus.textContent = `Error: ${errorMessage}`;
      this.isRecording = false;
      if (this.stream) this.stream.getTracks().forEach(track => track.stop());
      this.recordButton.classList.remove('recording');
      this.recordButton.setAttribute('title', 'Start Recording');
      this.stopLiveDisplay();
    }
  }

  private async stopRecording(): Promise<void> {
    if (this.mediaRecorder && this.isRecording) {
      try { this.mediaRecorder.stop(); } catch (e) { console.error('Error stopping MediaRecorder:', e); this.stopLiveDisplay(); }
      this.isRecording = false;
      this.recordButton.classList.remove('recording');
      this.recordButton.setAttribute('title', 'Start Recording');
      this.recordingStatus.textContent = 'Processing audio...';
    } else if (!this.isRecording) this.stopLiveDisplay();
  }

  private async processAudio(audioBlob: Blob): Promise<void> {
    if (audioBlob.size === 0) {
      this.recordingStatus.textContent = 'No audio data captured. Please try again.';
      return;
    }
    this.lastAudioBlob = audioBlob;
    this.playButton.disabled = false;
    try {
      this.recordingStatus.textContent = 'Converting audio...';
      const reader = new FileReader();
      const readResult = new Promise<string>((resolve, reject) => {
        reader.onloadend = () => {
          try { resolve((reader.result as string).split(',')[1]); }
          catch (err) { reject(err); }
        };
        reader.onerror = () => reject(reader.error);
      });
      reader.readAsDataURL(audioBlob);
      const base64Audio = await readResult;
      if (!base64Audio) throw new Error('Failed to convert audio to base64');
      const mimeType = this.mediaRecorder?.mimeType || 'audio/webm';
      await this.getTranscription(base64Audio, mimeType);
    } catch (error) {
      console.error('Error in processAudio:', error);
      this.recordingStatus.textContent = 'Error processing recording. Please try again.';
    } finally {
        this.updateSaveButtonState();
    }
  }

  private async getTranscription(base64Audio: string, mimeType: string): Promise<void> {
    try {
      this.recordingStatus.textContent = 'Getting transcription...';
      const contents = {parts: [{text: 'Generate a complete, detailed transcript of this audio.'}, {inlineData: {mimeType, data: base64Audio}}]};
      const response = await this.genAI.models.generateContent({model: MODEL_NAME, contents});
      const transcriptionText = response.text;
      if (transcriptionText) {
        this.rawTranscription.textContent = transcriptionText;
        if (transcriptionText.trim() !== '') this.rawTranscription.classList.remove('placeholder-active');
        else {
          this.rawTranscription.textContent = this.rawTranscription.getAttribute('placeholder') || '';
          this.rawTranscription.classList.add('placeholder-active');
        }
        if (this.currentNote) this.currentNote.rawTranscription = transcriptionText;
        this.recordingStatus.textContent = 'Transcription complete. Polishing note...';
        this.getPolishedNote().catch(err => {
          console.error('Error polishing note:', err);
          this.recordingStatus.textContent = 'Error polishing note after transcription.';
        });
      } else {
        this.recordingStatus.textContent = 'Transcription failed or returned empty.';
        this.polishedNote.innerHTML = '<p><em>Could not transcribe audio. Please try again.</em></p>';
        this.rawTranscription.textContent = this.rawTranscription.getAttribute('placeholder');
        this.rawTranscription.classList.add('placeholder-active');
      }
    } catch (error) {
      console.error('Error getting transcription:', error);
      this.recordingStatus.textContent = 'Error getting transcription. Please try again.';
      this.polishedNote.innerHTML = `<p><em>Error during transcription: ${error instanceof Error ? error.message : String(error)}</em></p>`;
      this.rawTranscription.textContent = this.rawTranscription.getAttribute('placeholder');
      this.rawTranscription.classList.add('placeholder-active');
    }
  }

  private async getPolishedNote(): Promise<void> {
    try {
      if (!this.rawTranscription.textContent || this.rawTranscription.textContent.trim() === '' || this.rawTranscription.classList.contains('placeholder-active')) {
        this.recordingStatus.textContent = 'No transcription to polish';
        this.polishedNote.innerHTML = '<p><em>No transcription available to polish.</em></p>';
        this.polishedNote.innerHTML = this.polishedNote.getAttribute('placeholder') || '';
        this.polishedNote.classList.add('placeholder-active');
        return;
      }
      this.recordingStatus.textContent = 'Polishing note...';
      const prompt = `Take this raw transcription and create a polished, well-formatted note. Remove filler words (um, uh, like), repetitions, and false starts. Format any lists or bullet points properly. Use markdown formatting for headings, lists, etc. Maintain all the original content and meaning. Raw transcription: ${this.rawTranscription.textContent}`;
      const response = await this.genAI.models.generateContent({model: MODEL_NAME, contents: prompt});
      const polishedText = response.text;
      if (polishedText) {
        const htmlContent = await marked.parse(polishedText);
        this.polishedNote.innerHTML = htmlContent;
        if (polishedText.trim() !== '') this.polishedNote.classList.remove('placeholder-active');
        else {
          this.polishedNote.innerHTML = this.polishedNote.getAttribute('placeholder') || '';
          this.polishedNote.classList.add('placeholder-active');
        }
        let noteTitleSet = false;
        const lines = polishedText.split('\n').map(l => l.trim());
        for (const line of lines) {
          if (line.startsWith('#')) {
            const title = line.replace(/^#+\s+/, '').trim();
            if (this.editorTitle && title) {
              this.editorTitle.textContent = title;
              this.editorTitle.classList.remove('placeholder-active');
              noteTitleSet = true;
              break;
            }
          }
        }
        if (!noteTitleSet && this.editorTitle) {
          for (const line of lines) {
            if (line.length > 0) {
              let potentialTitle = line.replace(/^[\*_\`#\->\s\[\]\(.\d)]+/, '').replace(/[\*_\`#]+$/, '').trim();
              if (potentialTitle.length > 3) {
                const maxLength = 60;
                this.editorTitle.textContent = potentialTitle.substring(0, maxLength) + (potentialTitle.length > maxLength ? '...' : '');
                this.editorTitle.classList.remove('placeholder-active');
                noteTitleSet = true;
                break;
              }
            }
          }
        }
        if (!noteTitleSet && this.editorTitle) {
          const currentEditorText = this.editorTitle.textContent?.trim();
          const placeholderText = this.editorTitle.getAttribute('placeholder') || 'Untitled Note';
          if (currentEditorText === '' || currentEditorText === placeholderText) {
            this.editorTitle.textContent = placeholderText;
            if (!this.editorTitle.classList.contains('placeholder-active')) this.editorTitle.classList.add('placeholder-active');
          }
        }
        if (this.currentNote) this.currentNote.polishedNote = polishedText;
        this.recordingStatus.textContent = 'Note polished. Ready for next recording.';
      } else {
        this.recordingStatus.textContent = 'Polishing failed or returned empty.';
        this.polishedNote.innerHTML = '<p><em>Polishing returned empty. Raw transcription is available.</em></p>';
        if (this.polishedNote.textContent?.trim() === '' || this.polishedNote.innerHTML.includes('<em>Polishing returned empty')) {
          this.polishedNote.innerHTML = this.polishedNote.getAttribute('placeholder') || '';
          this.polishedNote.classList.add('placeholder-active');
        }
      }
    } catch (error) {
      console.error('Error polishing note:', error);
      this.recordingStatus.textContent = 'Error polishing note. Please try again.';
      this.polishedNote.innerHTML = `<p><em>Error during polishing: ${error instanceof Error ? error.message : String(error)}</em></p>`;
      if (this.polishedNote.textContent?.trim() === '' || this.polishedNote.innerHTML.includes('<em>Error during polishing')) {
        this.polishedNote.innerHTML = this.polishedNote.getAttribute('placeholder') || '';
        this.polishedNote.classList.add('placeholder-active');
      }
    } finally {
        this.updateSaveButtonState();
    }
  }

  private togglePlayback(): void {
    if (!this.lastAudioBlob) return;
    if (this.isPlaying && this.audioPlayer) { this.audioPlayer.pause(); return; }
    if (this.audioPlayer && this.audioPlayer.paused) { this.audioPlayer.play(); return; }
    if (this.audioPlayer) URL.revokeObjectURL(this.audioPlayer.src);
    const audioUrl = URL.createObjectURL(this.lastAudioBlob);
    this.audioPlayer = new Audio(audioUrl);
    this.audioPlayer.onplay = () => {
      this.isPlaying = true;
      this.playButtonIcon.classList.replace('fa-play', 'fa-pause');
      this.playButton.title = 'Pause Recording';
    };
    this.audioPlayer.onpause = () => {
      this.isPlaying = false;
      this.playButtonIcon.classList.replace('fa-pause', 'fa-play');
      this.playButton.title = 'Play Recording';
    };
    this.audioPlayer.onended = () => {
      this.isPlaying = false;
      this.playButtonIcon.classList.replace('fa-pause', 'fa-play');
      this.playButton.title = 'Play Recording';
      if (this.audioPlayer) {
        URL.revokeObjectURL(this.audioPlayer.src);
        this.audioPlayer = null;
      }
    };
    this.audioPlayer.play().catch(e => { console.error('Error playing audio:', e); this.isPlaying = false; });
  }

  private createNewNote(): void {
    if (this.isPlaying && this.audioPlayer) this.audioPlayer.pause();
    if (this.audioPlayer) URL.revokeObjectURL(this.audioPlayer.src);
    this.audioPlayer = null;
    this.lastAudioBlob = null;
    this.isPlaying = false;
    this.playButton.disabled = true;
    this.playButtonIcon.classList.replace('fa-pause', 'fa-play');
    this.playButton.title = 'Play Recording';
    this.currentNote = {id: `note_${Date.now()}`};
    this.talkingPoints.value = '';
    this.rawTranscription.textContent = this.rawTranscription.getAttribute('placeholder') || '';
    this.rawTranscription.classList.add('placeholder-active');
    this.polishedNote.innerHTML = this.polishedNote.getAttribute('placeholder') || '';
    this.polishedNote.classList.add('placeholder-active');
    if (this.editorTitle) {
      this.editorTitle.textContent = this.editorTitle.getAttribute('placeholder') || 'Untitled Note';
      this.editorTitle.classList.add('placeholder-active');
    }
    this.recordingStatus.textContent = 'Ready to record';
    this.updateSaveButtonState();
    if (this.isRecording) { this.mediaRecorder?.stop(); this.isRecording = false; this.recordButton.classList.remove('recording'); }
    else this.stopLiveDisplay();
  }

  private async handleSaveToDrive(): Promise<void> {
    if (!this.lastAudioBlob || !this.currentNote?.polishedNote) {
      this.recordingStatus.textContent = 'Nothing to save.';
      return;
    }

    const saveIcon = this.saveButton.querySelector('i')!;
    const originalIconClass = 'fab fa-google-drive';
    const savingIconClass = 'fas fa-spinner fa-spin';

    this.saveButton.disabled = true;
    saveIcon.className = savingIconClass;
    this.recordingStatus.textContent = 'Saving to Google Drive...';

    try {
      const folderId = await this.findOrCreateDriveFolder();
      
      const noteTitle = this.editorTitle.textContent?.trim() || 'Untitled Note';
      const placeholderTitle = this.editorTitle.getAttribute('placeholder') || 'Untitled Note';
      const safeTitle = (noteTitle === placeholderTitle || !noteTitle) ? 'Untitled Note' : noteTitle.replace(/[^a-z0-9\s-]/gi, '_');

      const timestamp = new Date().toISOString().replace(/:/g, '-').slice(0, 19);
      const baseFilename = `${safeTitle} - ${timestamp}`;

      const markdownContent = this.currentNote.polishedNote;
      const markdownBlob = new Blob([markdownContent], {type: 'text/markdown'});

      await this.uploadFileToDrive(folderId, `${baseFilename}.md`, markdownBlob);
      await this.uploadFileToDrive(folderId, `${baseFilename}.webm`, this.lastAudioBlob);

      this.recordingStatus.textContent = 'Successfully saved! Returning to library...';
      setTimeout(() => this.switchToView('library'), 1500);
    } catch (error) {
      console.error('Error saving to Google Drive:', error);
      this.recordingStatus.textContent = 'Error saving to Drive. See console for details.';
    } finally {
      this.saveButton.disabled = false;
      saveIcon.className = originalIconClass;
    }
  }

  private async findOrCreateDriveFolder(): Promise<string> {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${DRIVE_FOLDER_NAME}' and trashed=false`;
    const response = await window.gapi.client.drive.files.list({ q });
    if (response.result.files && response.result.files.length > 0) {
      return response.result.files[0].id!;
    } else {
      const fileMetadata = {
        name: DRIVE_FOLDER_NAME,
        mimeType: 'application/vnd.google-apps.folder',
      };
      const newFolder = await window.gapi.client.drive.files.create({ resource: fileMetadata, fields: 'id' });
      return newFolder.result.id!;
    }
  }

  private async uploadFileToDrive(folderId: string, fileName: string, fileBlob: Blob): Promise<void> {
    const form = new FormData();
    const metadata = { name: fileName, parents: [folderId] };
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', fileBlob);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
      method: 'POST',
      headers: new Headers({ Authorization: `Bearer ${window.gapi.client.getToken().access_token}` }),
      body: form,
    });
    
    if (!response.ok) {
        const errorBody = await response.json();
        throw new Error(`Failed to upload ${fileName}: ${errorBody.error.message}`);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new VoiceNotesApp();

  document.querySelectorAll<HTMLElement>('[contenteditable][placeholder]').forEach(el => {
    const placeholder = el.getAttribute('placeholder')!;
    function updatePlaceholderState() {
      const currentText = (el.id === 'polishedNote' ? el.innerText : el.textContent)?.trim();
      if (currentText === '' || currentText === placeholder) {
        if (el.id === 'polishedNote' && currentText === '') el.innerHTML = placeholder;
        else if (currentText === '') el.textContent = placeholder;
        el.classList.add('placeholder-active');
      } else {
        el.classList.remove('placeholder-active');
      }
    }
    updatePlaceholderState();
    el.addEventListener('focus', function() {
      const currentText = (this.id === 'polishedNote' ? this.innerText : this.textContent)?.trim();
      if (currentText === placeholder) {
        if (this.id === 'polishedNote') this.innerHTML = '';
        else this.textContent = '';
        this.classList.remove('placeholder-active');
      }
    });
    el.addEventListener('blur', () => updatePlaceholderState());
  });
});

export {};