export type EaseFn = (u: number) => number;

const c1 = 1.70158;
const c2 = c1 * 1.525;
const c3 = c1 + 1;
const c4 = (2 * Math.PI) / 3;
const c5 = (2 * Math.PI) / 4.5;

function outBounce(x: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}

/** The easing names ADOFAI uses (DOTween's set), with the standard formulas from easings.net. */
const EASES: Record<string, EaseFn> = {
  Linear: (x) => x,
  InSine: (x) => 1 - Math.cos((x * Math.PI) / 2),
  OutSine: (x) => Math.sin((x * Math.PI) / 2),
  InOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  InQuad: (x) => x * x,
  OutQuad: (x) => 1 - (1 - x) * (1 - x),
  InOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
  InCubic: (x) => x ** 3,
  OutCubic: (x) => 1 - (1 - x) ** 3,
  InOutCubic: (x) => (x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2),
  InQuart: (x) => x ** 4,
  OutQuart: (x) => 1 - (1 - x) ** 4,
  InOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  InQuint: (x) => x ** 5,
  OutQuint: (x) => 1 - (1 - x) ** 5,
  InOutQuint: (x) => (x < 0.5 ? 16 * x ** 5 : 1 - (-2 * x + 2) ** 5 / 2),
  InExpo: (x) => (x === 0 ? 0 : 2 ** (10 * x - 10)),
  OutExpo: (x) => (x === 1 ? 1 : 1 - 2 ** (-10 * x)),
  InOutExpo: (x) =>
    x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2,
  InCirc: (x) => 1 - Math.sqrt(1 - x * x),
  OutCirc: (x) => Math.sqrt(1 - (x - 1) ** 2),
  InOutCirc: (x) =>
    x < 0.5 ? (1 - Math.sqrt(1 - (2 * x) ** 2)) / 2 : (Math.sqrt(1 - (-2 * x + 2) ** 2) + 1) / 2,
  InBack: (x) => c3 * x ** 3 - c1 * x * x,
  OutBack: (x) => 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2,
  InOutBack: (x) =>
    x < 0.5
      ? ((2 * x) ** 2 * ((c2 + 1) * 2 * x - c2)) / 2
      : ((2 * x - 2) ** 2 * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2,
  InElastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : -(2 ** (10 * x - 10)) * Math.sin((x * 10 - 10.75) * c4)),
  OutElastic: (x) => (x === 0 ? 0 : x === 1 ? 1 : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1),
  InOutElastic: (x) =>
    x === 0
      ? 0
      : x === 1
        ? 1
        : x < 0.5
          ? -(2 ** (20 * x - 10) * Math.sin((20 * x - 11.125) * c5)) / 2
          : (2 ** (-20 * x + 10) * Math.sin((20 * x - 11.125) * c5)) / 2 + 1,
  InBounce: (x) => 1 - outBounce(1 - x),
  OutBounce: outBounce,
  InOutBounce: (x) => (x < 0.5 ? (1 - outBounce(1 - 2 * x)) / 2 : (1 + outBounce(2 * x - 1)) / 2),
  Flash: (x) => (x < 1 ? 0 : 1),
  InFlash: (x) => (x < 1 ? 0 : 1),
  OutFlash: (x) => (x > 0 ? 1 : 0),
  InOutFlash: (x) => (x < 0.5 ? 0 : 1),
};

export function ease(name: unknown): EaseFn {
  return (typeof name === 'string' && EASES[name]) || EASES.Linear!;
}

export const EASE_NAMES = Object.keys(EASES);
