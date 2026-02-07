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
        setStatusIcon('🔓');
        setStatusText('Submission is Open');
        setTimeRemaining('No fixed deadline set by the Chair');
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

      // Determine status based on submission and deadline
      if (submittedAt) {
        const submissionDate = new Date(submittedAt);
        const lastActivityDate = latestUploadAt ? new Date(latestUploadAt) : submissionDate;
        const containsLateFiles = lastActivityDate > deadlineDate;

        if (containsLateFiles) {
          setStatusClass('status-late');
          setStatusIcon('⚠️');
          setStatusText('Submitted - Contains Late Files');
        } else if (submissionDate > deadlineDate) {
          setStatusClass('status-late');
          setStatusIcon('🟣');
          setStatusText('Submitted Late');
        } else {
          setStatusClass('status-green');
          setStatusIcon('✅');
          setStatusText('Submitted on Time');
        }
        
        if (latestUploadAt && lastActivityDate > submissionDate) {
          setTimeRemaining(`Last Activity: ${lastActivityDate.toLocaleString()}`);
        } else {
          setTimeRemaining(`Submitted on ${submissionDate.toLocaleString()}`);
        }
      } else if (isOverdue) {
        setStatusClass('status-red');
        setStatusIcon('🚨');
        setStatusText('OVERDUE');
        setTimeRemaining(`Overdue by ${formatDistanceToNow(deadlineDate)}`);
      } else if (hoursLeft < 24) {
        setStatusClass('status-red');
        setStatusIcon('🔴');
        setStatusText('Less than 24 hours remaining');
        setTimeRemaining(formatDistanceToNow(deadlineDate, { addSuffix: true }));
      } else if (daysLeft <= 7) {
        setStatusClass('status-yellow');
        setStatusIcon('🟡');
        setStatusText('Approaching Deadline');
        setTimeRemaining(formatDistanceToNow(deadlineDate, { addSuffix: true }));
      } else {
        setStatusClass('status-green');
        setStatusIcon('🟢');
        setStatusText('On Track');
        setTimeRemaining(formatDistanceToNow(deadlineDate, { addSuffix: true }));
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [deadline, submittedAt, settings.deadlineEnabled]);

  if (!deadline) {
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
        <div className="deadline-title-group">
          <span className="deadline-mini-label">DEADLINE:</span>
          {settings.deadlineEnabled ? (
            <span className="deadline-date-small">
              {deadlineDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </span>
          ) : (
            <span className="deadline-date-small">No fixed deadline</span>
          )}
        </div>
        
        <div className={`deadline-status-pill ${statusClass}`}>
          {statusIcon} {statusText}
        </div>
      </div>
  
      <div className="deadline-timer-row">
        <span className="countdown-timer">{timeRemaining}</span>
      </div>
  
      {settings.deadlineEnabled && (
        <div className="deadline-progress-mini">
          <div className="progress" style={{ height: '4px' }}>
            <div 
              className={`progress-bar ${statusClass === 'status-red' ? 'danger' : statusClass === 'status-yellow' ? 'warning' : ''}`}
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </div>
      )}

      {status === 'revision' && (
        <div className="alert alert-warning" style={{ marginTop: 'var(--space-4)' }}>
          ⚠️ Updates requested by Admin. Please check your documents and re-upload.
        </div>
      )}
    </div>
  );
}
