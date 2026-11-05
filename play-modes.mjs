export const PLAY_MODES = {
  image_word: {name:'图字探索', description:'先聊图，再配一个词'},
  image_only: {name:'纯图卡', description:'只看图，也可随时抽下一张'}
};
export const DEFAULT_PLAY_MODE = 'image_word';
// Missing mode is a pre-existing image/word round, not a new image-only round.
export const playMode = round => round?.play_mode === 'image_only' ? 'image_only' : DEFAULT_PLAY_MODE;
export const imageOnlyMode = round => playMode(round) === 'image_only';
