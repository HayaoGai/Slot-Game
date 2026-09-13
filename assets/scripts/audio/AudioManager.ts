export type SoundId =
    | 'buttonClick'
    | 'spinStart'
    | 'reelStop'
    | 'anticipation'
    | 'lineWin'
    | 'bigWin'
    | 'countUp'
    | 'freeSpinTrigger'
    | 'freeSpinEnd';

export interface IAudioManager {
    play(id: SoundId): void;
    stop(id: SoundId): void;
    setMuted(muted: boolean): void;
}

/**
 * 音效尚未製作。遊戲流程中所有需要音效的時間點都已呼叫 AudioManager.instance，
 * 之後只要以 AudioManager.use() 注入實作即可，不需要修改呼叫端。
 */
class SilentAudioManager implements IAudioManager {
    play(_id: SoundId): void {
        // 尚無音效資源
    }

    stop(_id: SoundId): void {
        // 尚無音效資源
    }

    setMuted(_muted: boolean): void {
        // 尚無音效資源
    }
}

export class AudioManager {
    private static current: IAudioManager = new SilentAudioManager();

    static get instance(): IAudioManager {
        return AudioManager.current;
    }

    static use(implementation: IAudioManager): void {
        AudioManager.current = implementation;
    }
}
