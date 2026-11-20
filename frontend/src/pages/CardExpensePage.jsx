import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { AppLayout } from '../components/layout/AppLayout';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { LoadingSpinner } from '../components/common/LoadingSpinner';
import { CardMessageParser } from '../components/expenses/CardMessageParser';
import { ParsedExpensePreview } from '../components/expenses/ParsedExpensePreview';
import { CollectorInbox } from '../components/expenses/CollectorInbox';
import { CollectorExpenseReview } from '../components/expenses/CollectorExpenseReview';
import { isMockMode } from '../services/apiClient';
import { tripService } from '../services/tripService';
import { cardEventService } from '../services/cardEventService';
import { expenseService } from '../services/expenseService';

export function CardExpensePage() {
  const { tripId } = useParams();
  const navigate = useNavigate();

  const [trip, setTrip] = useState(null);
  const [isLoadingTrip, setIsLoadingTrip] = useState(true);
  const [tripError, setTripError] = useState('');

  const [rawMessage, setRawMessage] = useState('');
  const [selectedPresetScenario, setSelectedPresetScenario] = useState('AUTO');
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState('');
  const [parseResult, setParseResult] = useState(null);
  const [showParser, setShowParser] = useState(false);

  useEffect(() => {
    let active = true;
    setIsLoadingTrip(true);
    setTripError('');

    tripService
      .getTripDetail(tripId)
      .then((data) => {
        if (active) setTrip(data);
      })
      .catch((err) => {
        if (active) setTripError(err.message || '여행 정보를 불러오지 못했어요.');
      })
      .finally(() => {
        if (active) setIsLoadingTrip(false);
      });

    return () => {
      active = false;
    };
  }, [tripId]);

  const handleParse = async (scenarioOverride) => {
    setParseError('');
    if (!rawMessage.trim()) {
      setParseError('분석할 카드 결제 알림 메시지를 입력하거나 붙여넣어 주세요.');
      return;
    }

    setIsParsing(true);
    setParseResult(null);
    try {
      const result = await cardEventService.parseCardMessage({
        tripId,
        rawMessage,
        mockScenario: scenarioOverride || selectedPresetScenario || 'AUTO',
      });
      setParseResult(result);
    } catch (err) {
      setParseError(err.message || '결제 메시지를 분석하는 중 문제가 발생했어요.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleSelectPreset = (preset) => {
    setRawMessage(preset.sampleMessage);
    setSelectedPresetScenario(preset.id);
    setParseError('');
    setParseResult(null);
  };

  const handleConfirmRegister = async (payload) => {
    await expenseService.createExpense(tripId, payload);
    navigate(`/trips/${tripId}`, {
      replace: true,
      state: { notice: `'${payload.merchantName}' 카드 지출이 등록되었어요.` },
    });
  };

  const registered = (title, refund) => navigate(`/trips/${tripId}`, {
    replace: true, state: { notice: `'${title}' ${refund ? '취소를 반영했어요.' : '카드 지출을 등록했어요.'}` },
  });

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto space-y-5">
        <Link
          to={`/trips/${tripId}`}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-secondary hover:text-primary-dark"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          {trip ? `${trip.title} 상세로 돌아가기` : '여행 상세로 돌아가기'}
        </Link>

        {isLoadingTrip ? (
          <LoadingSpinner label="여행 정보를 불러오고 있어요..." />
        ) : tripError || !trip ? (
          <Card className="text-center py-10 space-y-4">
            <AlertCircle className="w-8 h-8 text-danger mx-auto" />
            <p className="text-sm font-semibold text-ink-main">
              {tripError || '여행 정보를 찾을 수 없어요.'}
            </p>
            <Link to="/home">
              <Button variant="secondary">홈으로 돌아가기</Button>
            </Link>
          </Card>
        ) : (
          <div className="space-y-5">
            {!isMockMode() && <>
              <CollectorInbox key={tripId} trip={trip} onRegistered={registered} />
              <Button variant="secondary" aria-expanded={showParser}
                onClick={() => { setShowParser(!showParser); setRawMessage(''); setParseResult(null); setParseError(''); }}>
                {showParser ? '직접 입력 닫기' : '이전 카드 문자 직접 입력'}
              </Button>
            </>}
            {(isMockMode() || showParser) &&
            <CardMessageParser
              rawMessage={rawMessage}
              onRawMessageChange={(val) => {
                setRawMessage(val);
                setSelectedPresetScenario('AUTO');
                if (parseError) setParseError('');
              }}
              onParse={() => handleParse(selectedPresetScenario)}
              isParsing={isParsing}
              parseError={parseError}
              onSelectPreset={handleSelectPreset}
            />}

            {parseResult && !isMockMode() && <CollectorExpenseReview key={parseResult.event_id} manual
              trip={trip} event={parseResult} onClose={() => setParseResult(null)} onRegistered={registered} />}
            {parseResult && isMockMode() && (
              <ParsedExpensePreview
                tripId={tripId}
                parseResult={parseResult}
                members={trip.members || []}
                onConfirmRegister={handleConfirmRegister}
                onReset={() => {
                  setParseResult(null);
                  setParseError('');
                }}
              />
            )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
