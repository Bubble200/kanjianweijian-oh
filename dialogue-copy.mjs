export const EXPLORATION_NOTICE = '这些问题都可以跳过。不想回答，或者暂时想不到，也可以不答，我们继续下一步。';

export const FIRST_IMPRESSION_QUESTION = "你看到这张图片，第一个浮现的词或感觉是什么？可以是一种情绪、一个画面、或者任何冒出来的东西。";
export const firstImpressionQuestion = (position) => {
  const order = position === 2 ? '二' : position === 3 ? '三' : null;
  return order
    ? `你看到第${order}张图片，最先浮现的词或感觉是什么？可以是一种情绪、一个画面、或者任何冒出来的东西。`
    : FIRST_IMPRESSION_QUESTION;
};
export const ATTENTION_QUESTION = "图片里什么吸引了你的注意";
