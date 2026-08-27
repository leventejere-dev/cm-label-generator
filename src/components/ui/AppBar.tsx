import { useNavigate } from 'react-router-dom';
import { CmLogo } from '../../branding/CmLogo';
import { IconBack } from './Icons';

export interface AppBarProps {
  title?: string;
  /** Show a back control. When a path is given, navigates there instead of history. */
  back?: boolean | string;
}

export function AppBar({ title, back }: AppBarProps) {
  const navigate = useNavigate();

  return (
    <header className="app-bar no-print">
      {back ? (
        <button
          type="button"
          className="app-bar__back"
          aria-label="Înapoi"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
        >
          <IconBack size={18} />
        </button>
      ) : null}
      <CmLogo className="app-bar__logo" height="24px" />
      {title ? <span className="app-bar__title">{title}</span> : null}
    </header>
  );
}
