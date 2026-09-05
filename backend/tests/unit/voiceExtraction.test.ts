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
    const [result] = extractUpdateCandidates('Lead 999 ka loan sanction ho gaya hai', leads);
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

describe('extractUpdateCandidates — a seven-stage demo transcript', () => {
  // Adapted from the original 5-stage spec demo transcript for the new
  // 7-stage pipeline. Clause 2 deliberately avoids combining the words
  // "application" and "approve"/"sanction" in one clause — the extractor
  // resolves a clause's stage from the FIRST (by text position) matched
  // phrase, so a clause naming two different stage-words in passing
  // (e.g. "the application has been sanctioned") would ambiguously
  // resolve to the earlier-mentioned word's stage rather than the
  // clause's actual, later-mentioned status. This is a pre-existing
  // property of the underlying single-clause/single-action assumption,
  // not something the 7-stage rename changed — real transcripts should
  // state one stage-word per clause, same as this demo does.
  const transcript = [
    'Lead number 101 final state sanctioning par hai',
    'Lead 102 ka loan sanction ho gaya hai',
    'Lead 103 ki application pending hai',
    'Lead 104 ko application bhejna abhi baaki hai',
    'Lead 105 ko abhi contact karna baaki hai',
    'Lead 106 ko contact kiya lekin unka reply aana baaki hai',
  ].join('. ');

  const results = extractUpdateCandidates(transcript, leads);

  it('produces exactly six candidates, one per stated lead', () => {
    expect(results).toHaveLength(6);
  });

  it('101: "sanctioning par hai" resolves to SANCTIONED', () => {
    expect(results[0].matchedLeadId).toBe('l101');
    expect(results[0].proposedStage).toBe('SANCTIONED');
    expect(results[0].ambiguityReason).toBeNull();
  });

  it('102: "loan sanction ho gaya hai" resolves to SANCTIONED', () => {
    expect(results[1].matchedLeadId).toBe('l102');
    expect(results[1].proposedStage).toBe('SANCTIONED');
  });

  it('103: "application pending" (negated — "pending" is in the negation vocabulary) resolves to DOCUMENTS_RECEIVED, the stage before BRANCH_PROCESSING', () => {
    expect(results[2].matchedLeadId).toBe('l103');
    expect(results[2].proposedStage).toBe('DOCUMENTS_RECEIVED');
  });

  it('104: "application bhejna abhi baaki hai" (NOT yet sent) resolves to DOCUMENTS_RECEIVED, not BRANCH_PROCESSING', () => {
    // This is the key negation case: the word "application" is present,
    // but the statement explicitly says it hasn't been sent yet.
    expect(results[3].matchedLeadId).toBe('l104');
    expect(results[3].proposedStage).toBe('DOCUMENTS_RECEIVED');
  });

  it('105: "abhi contact karna baaki hai" (NOT yet contacted) has no earlier stage to fall back to, so it is NO_STAGE_MATCH', () => {
    // The other key negation case: "contact" is present, but the
    // statement explicitly says contact hasn't happened yet. Under the
    // 7-stage pipeline, "contact"/"interest" phrases resolve to
    // LEAD_CONFIRMED, the very FIRST stage — same as old INTERESTED, a
    // negated first-stage statement carries no safe positive information
    // and must not be guessed at, so this correctly produces no stage
    // match rather than fabricating one.
    expect(results[4].matchedLeadId).toBe('l105');
    expect(results[4].proposedStage).toBeNull();
    expect(results[4].ambiguityReason).toBe('NO_STAGE_MATCH');
  });

  it('106: "contact kiya lekin reply aana baaki hai" (contacted, reply pending) resolves to LEAD_CONFIRMED', () => {
    // Contact DID happen (past tense "kiya") — only the reply is
    // pending, which is remark detail, not a stage regression.
    expect(results[5].matchedLeadId).toBe('l106');
    expect(results[5].proposedStage).toBe('LEAD_CONFIRMED');
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
  it('recognizes DISBURSED/disbursement language', () => {
    const [result] = extractUpdateCandidates('Lead 103 ka loan disburse ho gaya hai', leads);
    expect(result.proposedStage).toBe('DISBURSED');
  });

  it('recognizes TO_RAC language ("sent to RAC")', () => {
    const [result] = extractUpdateCandidates('Lead 104 ki file RAC ko bhej di hai', leads);
    expect(result.proposedStage).toBe('TO_RAC');
  });

  it('recognizes APPROVED language only when RAC/final approval is explicit, not a bare "approve"', () => {
    const [result] = extractUpdateCandidates('Lead 105 RAC se approve ho gaya hai', leads);
    expect(result.proposedStage).toBe('APPROVED');
  });

  it('a bare, unqualified "approve"/"sanction" resolves to SANCTIONED, not APPROVED', () => {
    const [result] = extractUpdateCandidates('Lead 106 ka loan approve ho gaya hai', leads);
    expect(result.proposedStage).toBe('SANCTIONED');
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
