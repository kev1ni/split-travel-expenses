import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { InputField } from '../components/common/InputField';
import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const signupSuccessMessage = location.state?.signupSuccess || '';
  const redirectTarget = location.state?.from || '/home';
  const isFromInvite = redirectTarget.startsWith('/invite/');

  const validate = () => {
    const next = {};
    if (!username.trim()) {
      next.username = '아이디를 입력해 주세요.';
    }
    if (!password) {
      next.password = '비밀번호를 입력해 주세요.';
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validate()) return;

    setIsLoading(true);
    try {
      await login({ username: username.trim(), password });
      navigate(redirectTarget, { replace: true });
    } catch (err) {
      setServerError(
        err.message || '로그인에 실패했어요. 아이디와 비밀번호를 다시 확인해 주세요.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col items-center justify-center px-4 py-10 ntrip-page-enter">
      <div className="w-full max-w-[440px] space-y-6">
        {/* 상단 로고 */}
        <div className="flex justify-center">
          <BrandLogo to="/" size="md" />
        </div>

        {/* 로그인 카드 */}
        <Card padding="p-6 sm:p-8" className="rounded-[24px] shadow-soft-lg">
          <div className="text-center space-y-1.5 mb-6">
            <h1 className="text-2xl font-extrabold text-ink-main tracking-tight">
              다시 만나서 반가워요! 🌿
            </h1>
            <p className="text-sm text-ink-secondary">
              N빵트립에 로그인하고 여행을 이어가세요.
            </p>
          </div>

          {signupSuccessMessage && (
            <div
              role="status"
              className="mb-5 flex items-start gap-2.5 p-3.5 rounded-[14px] bg-primary-light/70 border border-primary/50 text-primary-dark text-sm font-medium"
            >
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{signupSuccessMessage}</p>
            </div>
          )}

          {isFromInvite && (
            <div
              role="status"
              className="mb-5 flex items-start gap-2.5 p-3.5 rounded-[14px] bg-surface-bg border border-surface-border text-ink-main text-xs sm:text-sm"
            >
              <p>
                여행 초대를 수락하려면 먼저 로그인해 주세요. 로그인 후 초대 화면으로 자동 이동해요.
              </p>
            </div>
          )}

          {(serverError || location.state?.sessionExpired) && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 p-3.5 rounded-[14px] bg-danger/10 border border-danger/20 text-danger text-sm font-medium"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{serverError || '로그인 세션이 끝났어요. 다시 로그인하면 보던 화면으로 돌아가요.'}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <InputField
              id="login-username"
              name="username"
              label="아이디"
              type="text"
              autoComplete="username"
              placeholder="아이디를 입력하세요"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (fieldErrors.username) {
                  setFieldErrors((prev) => ({ ...prev, username: '' }));
                }
              }}
              error={fieldErrors.username}
            />

            <InputField
              id="login-password"
              name="password"
              label="비밀번호"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password) {
                  setFieldErrors((prev) => ({ ...prev, password: '' }));
                }
              }}
              error={fieldErrors.password}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                  className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-ink-secondary hover:text-ink-main hover:bg-surface-bg transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              }
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>
                로그인
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-surface-border text-center text-sm text-ink-secondary">
            아직 계정이 없으신가요?{' '}
            <Link
              to="/signup"
              state={{ from: redirectTarget }}
              className="font-bold text-primary-dark hover:underline"
            >
              회원가입
            </Link>
          </div>
        </Card>

        {/* 홈으로 돌아가기 */}
        <div className="text-center">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-secondary hover:text-primary-dark transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            홈으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
