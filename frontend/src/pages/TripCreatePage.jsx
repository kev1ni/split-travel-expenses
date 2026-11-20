import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Compass, AlertCircle, Globe2, Sparkles } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { InputField } from '../components/common/InputField';
import { TRAVEL_COUNTRIES, getCountryByCode } from '../constants/countries';
import { CURRENCIES, getCurrencyMeta } from '../constants/currencies';
import { tripService } from '../services/tripService';

export function TripCreatePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [countryCode, setCountryCode] = useState('JP');
  const [cityDetail, setCityDetail] = useState('');
  const [baseCurrency, setBaseCurrency] = useState('JPY');
  const [isCurrencyManuallyChanged, setIsCurrencyManuallyChanged] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedCountry = getCountryByCode(countryCode);
  const selectedCurrencyMeta = getCurrencyMeta(baseCurrency);

  const handleCountryChange = (nextCode) => {
    setCountryCode(nextCode);
    const country = getCountryByCode(nextCode);
    if (country) {
      setBaseCurrency(country.defaultCurrency);
      setIsCurrencyManuallyChanged(false);
    }
    if (errors.countryCode) {
      setErrors((prev) => ({ ...prev, countryCode: '' }));
    }
  };

  const handleCurrencyChange = (nextCurrency) => {
    setBaseCurrency(nextCurrency);
    setIsCurrencyManuallyChanged(
      Boolean(selectedCountry && nextCurrency !== selectedCountry.defaultCurrency)
    );
  };

  const validate = () => {
    const next = {};
    if (!title.trim()) next.title = '여행 이름을 입력해 주세요.';
    if (!countryCode) next.countryCode = '여행 국가를 선택해 주세요.';
    if (!baseCurrency) next.baseCurrency = '기본 통화를 선택해 주세요.';
    if (!startDate) next.startDate = '여행 시작일을 선택해 주세요.';
    if (!endDate) next.endDate = '여행 종료일을 선택해 주세요.';
    if (startDate && endDate && startDate > endDate) {
      next.endDate = '종료일은 시작일 이후로 선택해 주세요.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setStatusMessage('');
    if (!validate()) return;

    const countryName = selectedCountry?.name || '';
    const location = cityDetail.trim()
      ? `${countryName} ${cityDetail.trim()}`.trim()
      : countryName;

    setIsSubmitting(true);
    try {
      const created = await tripService.createTrip({
        title: title.trim(),
        countryCode,
        countryName,
        location,
        baseCurrency,
        startDate,
        endDate,
        description: description.trim(),
      });
      if (created?.id) {
        navigate(`/trips/${created.id}`);
      } else {
        navigate('/home');
      }
    } catch (err) {
      setStatusMessage(
        err.message ||
          '새 여행 저장 기능은 백엔드 API(POST /api/trips)가 준비된 후 연동될 예정이에요.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-5">
        <Link
          to="/home"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-secondary hover:text-primary-dark"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          홈 대시보드로 돌아가기
        </Link>

        <Card padding="p-6 sm:p-8" className="space-y-6">
          <div className="flex items-center gap-3 pb-5 border-b border-surface-border">
            <div className="w-12 h-12 rounded-[16px] bg-primary text-ink-main flex items-center justify-center shadow-green-glow shrink-0">
              <Compass className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-ink-main">
                새로운 여행 만들기
              </h1>
              <p className="text-sm text-ink-secondary mt-0.5">
                여행 국가와 기본 통화, 일정을 입력해 여행을 시작해 보세요.
              </p>
            </div>
          </div>

          {statusMessage && (
            <div
              role="status"
              className="flex items-start gap-2.5 p-4 rounded-[16px] bg-[#FFF7E6] border border-[#F3D598] text-[#8F5910] text-sm font-medium"
            >
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              <p>{statusMessage}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate className="space-y-5">
            <InputField
              id="trip-title"
              label="여행 이름"
              required
              placeholder="예: 오사카 우정 여행"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors((prev) => ({ ...prev, title: '' }));
              }}
              error={errors.title}
            />

            {/* 여행 국가 & 기본 통화 (국가 선택 시 대표 통화 자동 추천, 독립 변경 가능) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="trip-country"
                  className="block text-sm font-semibold text-ink-main"
                >
                  여행 국가 <span className="text-danger">*</span>
                </label>
                <div className="relative">
                  <select
                    id="trip-country"
                    value={countryCode}
                    onChange={(e) => handleCountryChange(e.target.value)}
                    className="w-full min-h-[48px] px-4 py-3 rounded-[16px] bg-surface-card text-[15px] text-ink-main border border-surface-border hover:border-[#c8dca9] focus:border-primary-dark focus:ring-2 focus:ring-primary/40 cursor-pointer"
                  >
                    {TRAVEL_COUNTRIES.map((country) => (
                      <option key={country.code} value={country.code}>
                        {country.flag} {country.name} ({country.defaultCurrency})
                      </option>
                    ))}
                  </select>
                </div>
                {errors.countryCode && (
                  <p role="alert" className="text-xs font-medium text-danger pl-1">
                    {errors.countryCode}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="trip-currency"
                  className="block text-sm font-semibold text-ink-main"
                >
                  기본 통화 <span className="text-danger">*</span>
                </label>
                <select
                  id="trip-currency"
                  value={baseCurrency}
                  onChange={(e) => handleCurrencyChange(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 rounded-[16px] bg-surface-card text-[15px] text-ink-main border border-surface-border hover:border-[#c8dca9] focus:border-primary-dark focus:ring-2 focus:ring-primary/40 cursor-pointer"
                >
                  {CURRENCIES.map((cur) => (
                    <option key={cur.code} value={cur.code}>
                      {cur.code} ({cur.symbol} {cur.name})
                    </option>
                  ))}
                </select>
                {errors.baseCurrency && (
                  <p role="alert" className="text-xs font-medium text-danger pl-1">
                    {errors.baseCurrency}
                  </p>
                )}
              </div>
            </div>

            {/* 자동 추천 안내 + 국가/결제 통화 독립 관리 설명 */}
            {selectedCountry && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-[14px] bg-surface-bg border border-surface-border text-xs text-ink-secondary">
                {isCurrencyManuallyChanged ? (
                  <Globe2
                    className="w-4 h-4 text-primary-dark shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles
                    className="w-4 h-4 text-primary-dark shrink-0 mt-0.5"
                    aria-hidden="true"
                  />
                )}
                <p className="leading-relaxed">
                  {isCurrencyManuallyChanged ? (
                    <>
                      <strong className="text-ink-main">{selectedCountry.name}</strong> 여행의
                      기본 통화를 <strong className="text-primary-dark">{selectedCurrencyMeta.code}</strong>
                      로 직접 설정했어요. 지출 등록 시에도 결제 통화를 항목별로 자유롭게 선택할 수 있어요.
                    </>
                  ) : (
                    <>
                      <strong className="text-ink-main">{selectedCountry.name}</strong>의 대표 통화{' '}
                      <strong className="text-primary-dark">
                        {selectedCountry.defaultCurrency} ({selectedCurrencyMeta.name})
                      </strong>
                      가 자동 추천되었어요. 원하시면 위에서 기본 통화를 직접 변경할 수 있으며, 실제 지출 통화는 항목별로 독립 관리돼요.
                    </>
                  )}
                </p>
              </div>
            )}

            <InputField
              id="trip-city-detail"
              label="세부 도시 또는 지역 (선택)"
              placeholder="예: 오사카, 도쿄, 방콕, 파리"
              value={cityDetail}
              onChange={(e) => setCityDetail(e.target.value)}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <InputField
                id="trip-start-date"
                label="여행 시작일"
                required
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (errors.startDate)
                    setErrors((prev) => ({ ...prev, startDate: '' }));
                }}
                error={errors.startDate}
              />
              <InputField
                id="trip-end-date"
                label="여행 종료일"
                required
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  if (errors.endDate) setErrors((prev) => ({ ...prev, endDate: '' }));
                }}
                error={errors.endDate}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="trip-description"
                className="block text-sm font-semibold text-ink-main"
              >
                여행 한 줄 소개{' '}
                <span className="text-xs font-normal text-ink-secondary">(선택)</span>
              </label>
              <textarea
                id="trip-description"
                rows={3}
                placeholder="이번 여행의 콘셉트나 메모를 남겨 보세요."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-[16px] bg-surface-card text-[15px] text-ink-main placeholder:text-ink-secondary/75 border border-surface-border focus:border-primary-dark focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>

            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3 pt-4 border-t border-surface-border">
              <Button type="button" variant="secondary" onClick={() => navigate('/home')}>
                취소
              </Button>
              <Button type="submit" variant="primary" loading={isSubmitting}>
                여행 만들기
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppLayout>
  );
}
