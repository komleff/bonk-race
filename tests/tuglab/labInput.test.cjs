const test = require('node:test');
const assert = require('node:assert/strict');
const { LabInput } = require('../../.cache/tuglab-tests/client/src/lab/LabInput.js');
function fixture(keyboard = true) {
    global.window = new EventTarget();
    global.document = new EventTarget();
    document.activeElement = null;
    document.hidden = false;
    const canvas = new EventTarget();
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 800, height: 600 });
    return { canvas, input: new LabInput(canvas, { keyboard }) };
}
function event(target, type, props = {}) {
    const e = new Event(type, { cancelable: true });
    Object.assign(e, props); target.dispatchEvent(e); return e;
}
test('opt-in keyboard uses world direction and releases opposite keys correctly', () => {
    const { input } = fixture();
    event(window, 'keydown', { code: 'KeyW' });
    assert.equal(input.getState().y, -1);
    event(window, 'keydown', { code: 'KeyD' });
    assert.ok(Math.abs(input.getState().x - Math.SQRT1_2) < 1e-12);
    event(window, 'keyup', { code: 'KeyW' });
    assert.equal(input.getState().x, 1); assert.equal(input.getState().y, 0);
    event(window, 'keyup', { code: 'KeyD' });
    assert.equal(input.getState().magnitude, 0); input.destroy();
});
test('stock input ignores keyboard and retains mouse direction', () => {
    const { canvas, input } = fixture(false);
    event(window, 'keydown', { code: 'KeyW' });
    assert.equal(input.getState().magnitude, 0);
    input.setCharacterScreenPos(400, 400);
    event(canvas, 'mousedown', { button: 0, clientX: 700, clientY: 400 });
    assert.equal(input.getState().x, 1); assert.equal(input.getState().magnitude, 1);
    event(window, 'mouseup', { button: 0 });
    assert.equal(input.getState().magnitude, 0); input.destroy();
});
test('focus, blur, clear, visibility and destroy cannot leave held thrust', () => {
    const { canvas, input } = fixture();
    event(window, 'keydown', { code: 'KeyW' });
    document.activeElement = { tagName: 'INPUT' };
    event(document, 'focusin', { targetElement: document.activeElement });
    assert.equal(input.getState().magnitude, 0);
    event(window, 'keydown', { code: 'KeyD' });
    assert.equal(input.getState().magnitude, 0);
    document.activeElement = null;
    event(canvas, 'mousedown', { button: 0, clientX: 700, clientY: 300 });
    event(window, 'blur'); assert.equal(input.getState().magnitude, 0);
    event(window, 'keydown', { code: 'KeyW' }); input.clear();
    assert.equal(input.getState().magnitude, 0);
    event(window, 'keydown', { code: 'KeyW' }); document.hidden = true;
    event(document, 'visibilitychange'); assert.equal(input.getState().magnitude, 0);
    input.destroy(); event(window, 'keydown', { code: 'KeyW' });
    assert.equal(input.getState().magnitude, 0);
});
test('floating touch retains stock sign and cancel clears all held sources', () => {
    const { canvas, input } = fixture();
    event(canvas, 'touchstart', { changedTouches: [{ identifier: 4, clientX: 200, clientY: 200 }] });
    event(window, 'touchmove', { changedTouches: [{ identifier: 4, clientX: 200, clientY: 100 }] });
    assert.equal(input.getState().y, -1); assert.equal(input.getState().isTouch, true);
    event(window, 'keydown', { code: 'KeyD' });
    event(window, 'touchcancel', { changedTouches: [{ identifier: 4, clientX: 200, clientY: 100 }] });
    assert.equal(input.getState().magnitude, 0);
    event(window, 'keydown', { code: 'KeyD', repeat: true });
    assert.equal(input.getState().magnitude, 0); input.destroy();
});

test('clearing a held key requires a fresh press rather than auto-repeat', () => {
    const { input } = fixture();
    event(window, 'keydown', { code: 'KeyW' });
    assert.equal(input.getState().magnitude, 1);
    input.clear();
    event(window, 'keydown', { code: 'KeyW', repeat: true });
    assert.equal(input.getState().magnitude, 0);
    event(window, 'keyup', { code: 'KeyW' });
    event(window, 'keydown', { code: 'KeyW', repeat: false });
    assert.equal(input.getState().magnitude, 1); input.destroy();
});
