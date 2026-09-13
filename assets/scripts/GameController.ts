import { _decorator, Component } from 'cc';

const { ccclass } = _decorator;

@ccclass('GameController')
export class GameController extends Component {
    start(): void {
        console.log(`[GameController] scene loaded, reels found: ${this.node.parent?.getChildByName('Reel0') ? 1 : 0}`);
    }
}
