import { FolderOpen } from 'lucide-react';
import { useRef } from 'react';
import { loadFiles } from '../chart/loader';
import { useLevel } from '../stores/level';
import { Button } from './ui';

const ACCEPT = '.zip,.adofai,.ogg,.mp3,.wav,.m4a,.flac,.opus,.aac';

export function OpenButton({ big = false }: { big?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const loading = useLevel((s) => s.loading);
  return (
    <>
      <input
        ref={ref}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = '';
          if (files.length) void loadFiles(files);
        }}
      />
      <Button
        variant={big ? 'primary' : 'default'}
        className={big ? 'h-12 px-6 text-base' : undefined}
        disabled={loading}
        onClick={() => ref.current?.click()}
      >
        <FolderOpen size={big ? 18 : 15} />
        {loading ? '불러오는 중…' : big ? '레벨 파일 선택' : '레벨 열기'}
      </Button>
    </>
  );
}
