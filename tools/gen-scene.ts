/**
 * 產生 assets/scenes/Main.scene。
 * 執行：pnpm gen:scene
 */
import path from 'node:path';
import { color, LAYER_DEFAULT, ref, script, writeScene, type NodeSpec } from './lib/cocos-json';

const ROOT = process.cwd();
const scriptPath = (rel: string) => path.join(ROOT, 'assets/scripts', rel);

const DESIGN_W = 1280;
const DESIGN_H = 720;

const canvas: NodeSpec = {
  name: 'Canvas',
  position: [DESIGN_W / 2, DESIGN_H / 2],
  size: [DESIGN_W, DESIGN_H],
  components: [
    { type: 'cc.Canvas', props: { _cameraComponent: ref('camera'), _alignCanvasWithScreen: true } },
    {
      type: 'cc.Widget',
      props: {
        _alignFlags: 45,
        _target: null,
        _left: 0,
        _right: 0,
        _top: 0,
        _bottom: 0,
        _isAbsLeft: true,
        _isAbsRight: true,
        _isAbsTop: true,
        _isAbsBottom: true,
        _originalWidth: 0,
        _originalHeight: 0,
        _alignMode: 2,
        _lockFlags: 0,
      },
    },
  ],
  children: [
    {
      name: 'Camera',
      layer: LAYER_DEFAULT,
      noTransform: true,
      position: [0, 0],
      components: [
        {
          type: 'cc.Camera',
          key: 'camera',
          props: {
            _projection: 0,
            _priority: 0,
            _fov: 45,
            _fovAxis: 0,
            _orthoHeight: DESIGN_H / 2,
            _near: 0,
            _far: 2000,
            _color: color(0, 0, 0),
            _depth: 1,
            _stencil: 0,
            _clearFlags: 7,
            _rect: { __type__: 'cc.Rect', x: 0, y: 0, width: 1, height: 1 },
            _aperture: 19,
            _shutter: 7,
            _iso: 0,
            _screenScale: 1,
            _visibility: 1108344832,
            _targetTexture: null,
          },
        },
      ],
    },
    { name: 'Reel0', size: [140, 440] },
    { name: 'GameRoot', size: [1, 1], anchor: [0.5, 0.5], components: [script(scriptPath('GameController.ts'))] },
  ],
};

void vec2;
writeScene(path.join(ROOT, 'assets/scenes/Main.scene'), [canvas]);
console.log('Main.scene generated.');
