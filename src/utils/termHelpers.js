
/**
 * Helper to determine if a term is strictly in the past relative to the current term settings.
 * Returns TRUE if termId is OLDER than currentTermId.
 * Returns FALSE if termId is SAME or NEWER (Future).
 * 
 * Supports format: "YYYY-YYYY-SEMESTER"
 */
export const isPastTerm = (checkTermId, currentYear, currentSem) => {
  if (!checkTermId || !currentYear || !currentSem) return false;

  const currentTermId = `${currentYear}-${currentSem}`;
  if (checkTermId === currentTermId) return false; // Exact match is not past

  // Split components
  // termId example: "2024-2025-FIRST SEMESTER"
  const parseTerm = (tid) => {
    const parts = tid.split('-');
    if (parts.length < 3) return { yearStart: 0, semOrder: 0 };
    
    const yearStart = parseInt(parts[0], 10);
    const semesterStr = parts.slice(2).join(' ').toUpperCase(); // "FIRST SEMESTER"
    
    let semOrder = 0;
    if (semesterStr.includes('FIRST')) semOrder = 1;
    else if (semesterStr.includes('SECOND')) semOrder = 2;
    else if (semesterStr.includes('SUMMER') || semesterStr.includes('MID')) semOrder = 3; 
    
    return { yearStart, semOrder };
  };

  const check = parseTerm(checkTermId);
  const current = parseTerm(currentTermId);

  // Compare Years
  if (check.yearStart < current.yearStart) return true;
  if (check.yearStart > current.yearStart) return false;

  // If Years are equal, Compare Semesters
  if (check.semOrder < current.semOrder) return true;
  
  return false;
};
