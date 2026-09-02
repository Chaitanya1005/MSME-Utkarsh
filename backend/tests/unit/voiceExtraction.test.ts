import { extractUpdateCandidates, AuthorizedLeadForExtraction } from '../../src/services/voiceExtraction';

const leads: AuthorizedLeadForExtraction[] = [
  { id: 'l101', customerName: 'Anil Sharma', sourceSrNo: '101' },
  { id: 'l102', customerName: 'Rakesh Verma', sourceSrNo: '102' },
  { id: 'l103', customerName: 'Sunita Singh', sourceSrNo: '103' },
  { id: 'l104', customerName: 'Deepak Joshi', sourceSrNo: '104' },
  { id: 'l105', customerName: 'Kavita Reddy', sourceSrNo: '105' },
  { id: 'l106', customerName: 'Ramesh Iyer', sourceSrNo: '106' },
  // deliberately shares "Sharma" with l101, and has no source number at
  // all, to exercise both the name-fallback path and the "no source
  // reference" case.
  { id: 'lNoNum', customerName: 'Rohit Sharma', sourceSrNo: null },
];

describe('extractUpdateCandidates — lead number identification (primary mechanism)', () => {
  it('matches "Lead 101" to the lead whose sourceSrNo is "101"', () => {
    const [result] = extractUpdateCandidates('Lead 101 final state sanctioning par hai', leads);
    expect(result.spokenLeadNumber).toBe('101');
    expect(result.matchedLeadId).toBe('l101');
    expect(result.ambiguityReason).toBeNull();
  });

  it('matches "Lead number 101" (with the filler word "number")', () => {
    const [result] = extractUpdateCandidates('Lead number 101 final state sanctioning par hai', leads);
    expect(result.matchedLeadId).toBe('l101');
  });

  it('reports notFound-worthy NO_LEAD_MATCH with the spoken number when no lead has that source reference', () => {
    const [result] = extractUpdateCandidates('Lead 999 ki application approve ho chuki hai', leads);
    expect(result.spokenLeadNumber).toBe('999');
    expect(result.matchedLeadId).toBeNull();
    expect(result.ambiguityReason).toBe('NO_LEAD_MATCH');
  });

  it('never guesses by name when an explicit (but non-matching) lead number was spoken', () => {
    // "Sharma" would otherwise ambiguously match l101 and lNoNum by name,
    // but an explicit, non-existent lead number was spoken — the number
    // takes priority and this must NOT fall back to name matching.
    const [result] = extractUpdateCandidates('Lead 555 Sharma ji ka loan contacted ho gaya', leads);
    expect(result.ambiguityReason).toBe('NO_LEAD_MATCH');
    expect(result.matchedLeadId).toBeNull();
  });

  it('falls back to name matching only when no lead number is spoken at all', () => {
    const [result] = extractUpdateCandidates('Verma ji ka application submit ho gaya hai', leads);
    expect(result.spokenLeadNumber).toBeNull();
    expect(result.matchedLeadId).toBe('l102');
  });

  it('reports genuine name ambiguity when no number is spoken and two leads share a name fragment', () => {
    const [result] = extractUpdateCandidates('Sharma ji ka loan contacted ho gaya', leads);
    expect(result.ambiguityReason).toBe('MULTIPLE_LEAD_MATCH');
    expect(result.candidateLeadIds.sort()).toEqual(['l101', 'lNoNum']);
  });
});

describe('extractUpdateCandidates — the exact spec demo transcript', () => {
  const transcript = [
    'Lead number 101 final state sanctioning par hai',
    'Lead 102 ki application approve ho chuki hai',
    'Lead 103 ki application pending hai',
    'Lead 104 ko application bhejna abhi baaki hai',
    'Lead 105 ko abhi contact karna baaki hai',
    'Lead 106 ko contact kiya lekin unka reply aana baaki hai',
  ].join('. ');

  const results = extractUpdateCandidates(transcript, leads);

  it('produces exactly six candidates, one per stated lead', () => {
    expect(results).toHaveLength(6);
  });

  it('101: "sanctioning par hai" resolves to APPROVAL', () => {
    expect(results[0].matchedLeadId).toBe('l101');
    expect(results[0].proposedStage).toBe('APPROVAL');
    expect(results[0].ambiguityReason).toBeNull();
  });

  it('102: "application approve ho chuki hai" resolves to APPROVAL', () => {
    expect(results[1].matchedLeadId).toBe('l102');
    expect(results[1].proposedStage).toBe('APPROVAL');
  });

  it('103: "application pending" (no negation) resolves to APPLICATION', () => {
    expect(results[2].matchedLeadId).toBe('l103');
    expect(results[2].proposedStage).toBe('APPLICATION');
  });

  it('104: "application bhejna abhi baaki hai" (NOT yet sent) resolves to CONTACTED, not APPLICATION', () => {
    // This is the key negation case: the word "application" is present,
    // but the statement explicitly says it hasn't been sent yet.
    expect(results[3].matchedLeadId).toBe('l104');
    expect(results[3].proposedStage).toBe('CONTACTED');
  });

  it('105: "abhi contact karna baaki hai" (NOT yet contacted) resolves to INTERESTED, not CONTACTED', () => {
    // The other key negation case: "contact" is present, but the
    // statement explicitly says contact hasn't happened yet.
    expect(results[4].matchedLeadId).toBe('l105');
    expect(results[4].proposedStage).toBe('INTERESTED');
  });

  it('106: "contact kiya lekin reply aana baaki hai" (contacted, reply pending) resolves to CONTACTED', () => {
    // Contact DID happen (past tense "kiya") — only the reply is
    // pending, which is remark detail, not a stage regression.
    expect(results[5].matchedLeadId).toBe('l106');
    expect(results[5].proposedStage).toBe('CONTACTED');
  });

  it('never returns a candidateLeadIds entry outside the authorized lead list', () => {
    const allAuthorizedIds = leads.map((l) => l.id);
    for (const candidate of results) {
      for (const id of candidate.candidateLeadIds) {
        expect(allAuthorizedIds).toContain(id);
      }
      if (candidate.matchedLeadId) {
        expect(allAuthorizedIds).toContain(candidate.matchedLeadId);
      }
    }
  });
});

describe('extractUpdateCandidates — stage phrase edge cases', () => {
  it('recognizes CONVERSION/disbursement language', () => {
    const [result] = extractUpdateCandidates('Lead 103 ka loan disburse ho gaya hai', leads);
    expect(result.proposedStage).toBe('CONVERSION');
  });

  it('flags NO_STAGE_MATCH rather than guessing when the clause states no recognizable stage', () => {
    const [result] = extractUpdateCandidates('Lead 102 ka file abhi table par hai', leads);
    expect(result.matchedLeadId).toBe('l102');
    expect(result.proposedStage).toBeNull();
    expect(result.ambiguityReason).toBe('NO_STAGE_MATCH');
  });

  it('preserves the BM\'s actual words as remarks rather than fabricating detail', () => {
    const [result] = extractUpdateCandidates('Lead 102 ki application submit ho gaya, documents complete hain', leads);
    expect(result.remarks).toContain('documents complete hain');
  });

  it('handles an empty transcript by returning no candidates rather than erroring', () => {
    expect(extractUpdateCandidates('', leads)).toEqual([]);
    expect(extractUpdateCandidates('   ', leads)).toEqual([]);
  });
});
