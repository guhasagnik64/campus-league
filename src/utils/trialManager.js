const TRIAL_MAX_SESSIONS = 10;
const TRIAL_MAX_DAYS = 10;

export function getStudentTrialStatus(student) {
  if (!student) {
    return { hasAccess: true, isPaid: false, isTrial: true, remainingSessions: TRIAL_MAX_SESSIONS };
  }

  if (student.isPaid) {
    return { hasAccess: true, isPaid: true, isTrial: false, remainingSessions: Infinity };
  }

  const completedSessions = student.sessions ? student.sessions.length : 0;
  const registrationDate = student.createdAt ? new Date(student.createdAt) : new Date();
  const diffInDays = Math.floor((new Date() - registrationDate) / (1000 * 60 * 60 * 24));

  const isTrialActive = completedSessions < TRIAL_MAX_SESSIONS && diffInDays < TRIAL_MAX_DAYS;

  return {
    hasAccess: isTrialActive,
    isPaid: false,
    isTrial: isTrialActive,
    completedSessions,
    remainingSessions: Math.max(0, TRIAL_MAX_SESSIONS - completedSessions),
    remainingDays: Math.max(0, TRIAL_MAX_DAYS - diffInDays)
  };
}