import { useState, useEffect } from 'react';
import { formatDistanceToNow, isPast, differenceInDays, differenceInHours } from 'date-fns';
import { useSystem } from '../context/SystemContext';

export default function DeadlineBanner({ deadline, submittedAt, status, latestUploadAt }) {
  const { settings } = useSystem();
  const [timeRemaining, setTimeRemaining] = useState('');
  const [statusClass, setStatusClass] = useState('status-green');
  const [statusIcon, setStatusIcon] = useState('🟢');
  const [statusText, setStatusText] = useState('');

  useEffect(() => {
    const updateCountdown = () => {
      // If deadline is disabled, show neutral "Open" status
      if (!settings.deadlineEnabled) {
        setStatusClass('status-green');
        setStatusIcon('✨');
        setStatusText('Active Submission Session');
        setTimeRemaining('No fixed administrative deadline established.');
        return;
      }

      if (!deadline) return;

      const deadlineDate = new Date(deadline);
      // Safety check for invalid date strings
      if (isNaN(deadlineDate.getTime())) return;

      const now = new Date();
      const isOverdue = isPast(deadlineDate);
      const daysLeft = differenceInDays(deadlineDate, now);
      const hoursLeft = differenceInHours(deadlineDate, now);

      if (status === 'approved') {
        setStatusClass('status-green');
        setStatusIcon('🏛️');
        setStatusText('Verified & Compliant');
        setTimeRemaining('This checklist has been officially verified by the department chair.');
        return;
      }

      // Determine status based on submission and deadline
      if (submittedAt) {
        const submissionDate = new Date(submittedAt);
        const lastActivityDate = latestUploadAt ? new Date(latestUploadAt) : submissionDate;
        const containsLateFiles = lastActivityDate > deadlineDate;

        if (containsLateFiles) {
          setStatusClass('status-late');
          setStatusIcon('📅');
          setStatusText('Submitted (Late Updates)');
        } else if (submissionDate > deadlineDate) {
          setStatusClass('status-late');
          setStatusIcon('⌛');
          setStatusText('Post-Deadline Submission');
        } else {
          setStatusClass('status-green');
          setStatusIcon('🛡️');
          setStatusText('Compliant Submission');
        }
        
        if (latestUploadAt && lastActivityDate > submissionDate) {
          setTimeRemaining(`Final Activity: ${lastActivityDate.toLocaleString()}`);
        } else {
          setTimeRemaining(`Successfully Logged: ${submissionDate.toLocaleString()}`);
        }
      } else if (isOverdue) {
        setStatusClass('status-red');
        setStatusIcon('⚠️');
        setStatusText('Deadline Exceeded');
        setTimeRemaining(`Term ended ${formatDistanceToNow(deadlineDate)} ago.`);
      } else if (hoursLeft < 24) {
        setStatusClass('status-red');
        setStatusIcon('🔥');
        setStatusText('Critical: Under 24 Hours');
        setTimeRemaining(`System closes ${formatDistanceToNow(deadlineDate, { addSuffix: true })}.`);
      } else if (daysLeft <= 7) {
        setStatusClass('status-yellow');
        setStatusIcon('⏳');
        setStatusText('Approaching Deadline');
        setTimeRemaining(`Concluding ${formatDistanceToNow(deadlineDate, { addSuffix: true })}.`);
      } else {
        setStatusClass('status-green');
        setStatusIcon('📝');
        setStatusText('Compliance in Progress');
        setTimeRemaining(`Standard deadline ${formatDistanceToNow(deadlineDate, { addSuffix: true })}.`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [deadline, submittedAt, settings.deadlineEnabled, status]);

  if (!deadline && settings.deadlineEnabled) {
    return null;
  }

  const deadlineDate = new Date(deadline);
  if (isNaN(deadlineDate.getTime())) return null;

  const progress = submittedAt ? 100 : Math.min(
    ((new Date() - new Date(deadline).getTime() + 30 * 24 * 60 * 60 * 1000) / 
    (30 * 24 * 60 * 60 * 1000)) * 100,
    100
  );

  return (
    <div className={`deadline-banner ${statusClass}`}>
      <div className="deadline-header-row">
        <div className={`deadline-status-pill ${statusClass}`}>
          <span className="status-pill-icon">{statusIcon}</span>
          <span className="status-pill-text">{statusText}</span>
        </div>

        {settings.deadlineEnabled && (
          <div className="deadline-title-group">
            <span className="deadline-mini-label">TERM DEADLINE</span>
            <span className="deadline-date-small">
              {deadlineDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              })}
            </span>
          </div>
        )}
      </div>
  
      <div className="deadline-timer-row">
        <div className="countdown-timer-wrapper">
          <span className="countdown-timer">{timeRemaining}</span>
        </div>
      </div>
  
      {settings.deadlineEnabled && (
        <div className="deadline-progress-mini">
          <div 
            className="progress-bar"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      )}
    </div>
  );
}
