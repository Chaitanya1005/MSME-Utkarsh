// Provider boundary for outbound calling (spec Phase 5, section 11–14).
// Same pattern as every other provider in this directory: an interface,
// a concrete implementation, one wiring point (providers/index.ts).
//
// INTEGRATION POINT for Twilio (or any other telephony provider): create
// a class here implementing CallingProvider — e.g. `TwilioCallingProvider`
// — that calls the real API and returns a real providerCallId, then
// change only the instantiation in providers/index.ts. No other file in
// this codebase (calling.service.ts, controllers, routes, mobile) needs
// to change.
//
// DevMockCallingProvider below is an explicitly-labeled, isolated
// development implementation used so the full request/response/state
// flow (loading -> success/failure) can be exercised without a real
// telephony vendor. It never claims a call actually connected or
// completed — it only simulates the provider boundary *accepting* the
// request, which is as far as this phase's architecture is meant to go
// (spec section 14: "do not present a mock call as an actual completed
// telephony integration").

export interface PlaceCallResult {
  accepted: boolean;
  providerCallId?: string;
  failureReason?: string;
}

export interface CallingProvider {
  placeCall(toPhoneNumber: string): Promise<PlaceCallResult>;
}

export class DevMockCallingProvider implements CallingProvider {
  async placeCall(toPhoneNumber: string): Promise<PlaceCallResult> {
    // No real network call, no real telephony vendor — this exists only
    // to let the rest of the application's request/response/state
    // handling be built and tested against a real interface shape.
    if (!toPhoneNumber || toPhoneNumber.trim().length === 0) {
      return { accepted: false, failureReason: 'No phone number provided' };
    }
    return { accepted: true, providerCallId: `dev-mock-${Date.now()}` };
  }
}
