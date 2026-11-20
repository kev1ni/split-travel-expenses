import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, ArrowLeft, AlertCircle } from 'lucide-react';
import { BrandLogo } from '../components/common/BrandLogo';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { InputField } from '../components/common/InputField';
import { useAuth } from '../hooks/useAuth';

export function SignupPage() {
  const { signup } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [nickname, setNickname] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const redirectTarget = location.state?.from;

  const validate = () => {
    const next = {};
    const trimmedNickname = nickname.trim();
    const trimmedUsername = username.trim();

    if (!trimmedNickname) {
      next.nickname = '이름 또는 닉네임을 입력해 주세요.';
    } else if (trimmedNickname.length < 2 || trimmedNickname.length > 20) {
      next.nickname = '이름 또는 닉네임은 2자 이상 20자 이하로 입력해 주세요.';
    }

    if (!trimmedUsername) {
      next.username = '아이디를 입력해 주세요.';
    } else if (trimmedUsername.length < 4 || trimmedUsername.length > 20) {
      next.username = '아이디는 4자 이상 20자 이하로 입력해 주세요.';
    } else if (!/^[a-zA-Z0-9_]+$/.test(trimmedUsername)) {
      next.username = '아이디는 영문, 숫자, 밑줄(_)만 사용할 수 있어요.';
    }

    if (!password) {
      next.password = '비밀번호를 입력해 주세요.';
    } else if (password.length < 8) {
      next.password = '비밀번호는 최소 8자 이상 입력해 주세요.';
    }

    if (!confirmPassword) {
      next.confirmPassword = '비밀번호 확인을 입력해 주세요.';
    } else if (password !== confirmPassword) {
      next.confirmPassword = '비밀번호가 일치하지 않아요.';
    }

    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const clearFieldError = (field) => {
    if (fieldErrors[field]) {
      setFieldErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setServerError('');

    if (!validate()) return;

    setIsLoading(true);
    try {
      await signup({
        nickname: nickname.trim(),
        username: username.trim(),
        password,
      });

      navigate('/login', {
        replace: true,
        state: {
          signupSuccess: '회원가입이 완료되었어요! 방금 만든 계정으로 로그인해 주세요.',
          from: redirectTarget,
        },
      });
    } catch (err) {
      if (err.code === 'DUPLICATE_USERNAME' || err.status === 409) {
        setFieldErrors((prev) => ({
          ...prev,
          username: err.message || '이미 사용 중인 아이디예요.',
        }));
      } else {
        setServerError(
          err.message || '회원가입 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-bg flex flex-col items-center justify-center px-4 py-10 ntrip-page-enter">
      <div className="w-full max-w-[460px] space-y-6">
        <div className="flex justify-center">
          <BrandLogo to="/" size="md" />
        </div>

        <Card padding="p-6 sm:p-8" className="rounded-[24px] shadow-soft-lg">
          <div className="text-center space-y-1.5 mb-6">
            <h1 className="text-2xl font-extrabold text-ink-main tracking-tight">
              함께 떠날 준비 되셨나요? ✈️
            </h1>
            <p className="text-sm text-ink-secondary">
              N빵트립에 가입하고 여행 경비를 스마트하게 관리해 보세요.
            </p>
          </div>

          {serverError && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 p-3.5 rounded-[14px] bg-danger/10 border border-danger/20 text-danger text-sm font-medium"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{serverError}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <InputField
              id="signup-nickname"
              name="nickname"
              label="이름 또는 닉네임"
              required
              placeholder="예: 김여행"
              value={nickname}
              onChange={(e) => {
                setNickname(e.target.value);
                clearFieldError('nickname');
              }}
              error={fieldErrors.nickname}
            />

            <InputField
              id="signup-username"
              name="username"
              label="아이디"
              required
              autoComplete="username"
              placeholder="4~20자 영문, 숫자, 밑줄(_)"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                clearFieldError('username');
              }}
              error={fieldErrors.username}
              helperText="중복 여부는 회원가입 요청 시 서버 응답으로 확인돼요."
            />

            <InputField
              id="signup-password"
              name="password"
              label="비밀번호"
              required
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="최소 8자 이상 입력하세요"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError('password');
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

            <InputField
              id="signup-password-confirm"
              name="confirmPassword"
              label="비밀번호 확인"
              required
              type={showConfirmPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="비밀번호를 한 번 더 입력하세요"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                clearFieldError('confirmPassword');
              }}
              error={fieldErrors.confirmPassword}
              rightElement={
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  aria-label={showConfirmPassword ? '비밀번호 숨기기' : '비밀번호 표시'}
                  className="w-9 h-9 rounded-xl inline-flex items-center justify-center text-ink-secondary hover:text-ink-main hover:bg-surface-bg transition-colors"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <Eye className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
              }
            />

            <div className="pt-2">
              <Button type="submit" variant="primary" size="lg" fullWidth loading={isLoading}>
                회원가입 완료
              </Button>
            </div>
          </form>

          <div className="mt-6 pt-5 border-t border-surface-border text-center text-sm text-ink-secondary">
            이미 계정이 있으신가요?{' '}
            <Link
              to="/login"
              state={{ from: redirectTarget }}
              className="font-bold text-primary-dark hover:underline"
            >
              로그인
            </Link>
          </div>
        </Card>

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
