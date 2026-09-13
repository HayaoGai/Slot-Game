import { Asset, Prefab, resources, SpriteFrame } from 'cc';
import { ALL_SYMBOLS } from '../core/config';
import type { SymbolId } from '../core/types';

function load<T extends Asset>(path: string, type: new () => T): Promise<T> {
    return new Promise((resolve, reject) => {
        resources.load(path, type, (err, asset) => (err ? reject(err) : resolve(asset)));
    });
}

/**
 * 所有貼圖與 prefab 皆放在 assets/resources/ 並於 runtime 載入，
 * 場景與 prefab 內因此不需要引用任何資產 uuid。
 */
export class GameAssets {
    private static readonly symbols = new Map<SymbolId, SpriteFrame>();
    private static loaded: Promise<void> | null = null;

    static symbolPrefab: Prefab;
    static highlightPrefab: Prefab;
    static winLabelPrefab: Prefab;
    static background: SpriteFrame;
    static white: SpriteFrame;
    static glow: SpriteFrame;
    static avatar: SpriteFrame;

    static loadAll(): Promise<void> {
        if (!GameAssets.loaded) GameAssets.loaded = GameAssets.doLoad();
        return GameAssets.loaded;
    }

    static symbolFrame(id: SymbolId): SpriteFrame {
        const frame = GameAssets.symbols.get(id);
        if (!frame) throw new Error(`Symbol texture not loaded: ${id}`);
        return frame;
    }

    private static async doLoad(): Promise<void> {
        const frames = await Promise.all(ALL_SYMBOLS.map((id) => load(`textures/symbols/${id}/spriteFrame`, SpriteFrame)));
        ALL_SYMBOLS.forEach((id, i) => GameAssets.symbols.set(id, frames[i]));

        [GameAssets.symbolPrefab, GameAssets.highlightPrefab, GameAssets.winLabelPrefab] = await Promise.all([
            load('prefabs/Symbol', Prefab),
            load('prefabs/PaylineHighlight', Prefab),
            load('prefabs/WinLabel', Prefab),
        ]);
        [GameAssets.background, GameAssets.white, GameAssets.glow, GameAssets.avatar] = await Promise.all([
            load('textures/ui/background/spriteFrame', SpriteFrame),
            load('textures/ui/white/spriteFrame', SpriteFrame),
            load('textures/ui/glow/spriteFrame', SpriteFrame),
            load('textures/ui/avatar/spriteFrame', SpriteFrame),
        ]);
    }
}
