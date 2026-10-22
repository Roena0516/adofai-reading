import { Hand, Keyboard, ListOrdered } from 'lucide-react';
import { useLevel } from '../stores/level';
import { OpenButton } from './OpenButton';

const FEATURES = [
  {
    icon: ListOrdered,
    title: '채보를 손가락 레인으로',
    body: '타일 각도와 BPM 변화를 실제 타이밍으로 계산하고, 연타 속도에 맞춰 어느 손가락으로 칠지 레인에 배정합니다.',
  },
  {
    icon: Hand,
    title: '내 타법 그대로',
    body: '몇 BPM까지 한 손으로, 어디부터 양손 교대·안밖·3412로 칠지 전부 프로필로 정할 수 있습니다.',
  },
  {
    icon: Keyboard,
    title: '키보드로 연습',
    body: '지정한 키로 직접 치면 타이밍과 손가락까지 판정하고, 약한 구간을 골라 반복할 수 있습니다.',
  },
];

export function DropScreen() {
  const error = useLevel((s) => s.error);
  return (
    <div className="flex flex-1 justify-center overflow-y-auto px-[clamp(20px,4vw,40px)] scroll-thin">
      <div className="w-full max-w-[1000px] pt-[clamp(40px,7vw,88px)] pb-16">
        <div className="flex flex-col items-center gap-6 rounded-[32px] border border-dashed border-border-2 bg-surface px-[clamp(24px,5vw,56px)] py-[clamp(36px,6vw,64px)] text-center">
          <p className="m-0 text-xs tracking-[0.5px] text-accent-soft">ADOFAI 타법 리더</p>
          <h1 className="m-0 text-[clamp(30px,4vw,46px)] leading-[1.2] font-medium">
            레벨을 여기에 끌어다 놓으세요
          </h1>
          <p className="m-0 max-w-[46ch] text-[16px] leading-[1.6] text-muted">
            커스텀 레벨 zip 파일, 또는 .adofai 파일과 음악 파일을 함께 넣으면 됩니다. 파일은 브라우저 안에서만
            읽고 어디에도 올리지 않습니다.
          </p>
          <OpenButton big />
          {error && <p className="m-0 text-sm text-wrong">{error}</p>}
        </div>
        <ul className="m-0 mt-5 grid list-none gap-5 p-0 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
          {FEATURES.map((f) => (
            <li key={f.title} className="card flex flex-col gap-3 p-6">
              <f.icon size={20} className="text-accent-soft" />
              <h2 className="m-0 text-[18px] leading-[1.25] font-medium">{f.title}</h2>
              <p className="m-0 text-[14.5px] leading-[1.6] text-muted">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
