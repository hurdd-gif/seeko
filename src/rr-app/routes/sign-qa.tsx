import { AgreementRouteContent } from './agreement';

export function SignQaRoute() {
  return (
    <AgreementRouteContent
      data={{
        status: 'ready',
        index: {
          status: 'ready',
          userId: 'qa',
          userEmail: 'qa@example.invalid',
          title: 'Mutual NDA',
          sections: [
            {
              number: 1,
              title: 'Confidential Information',
              content: '<p>The Receiving Party shall hold the Confidential Information in strict confidence.</p>',
            },
            {
              number: 2,
              title: 'Limitation of Liability',
              content: '<p>Neither party shall be liable for indirect or consequential damages arising from this agreement.</p>',
            },
            {
              number: 3,
              title: 'Governing Law',
              content: '<p>This agreement is governed by the laws of the State of California.</p>',
            },
          ],
          department: '',
          role: '',
          isContractor: false,
          onboarded: 1,
        },
      }}
    />
  );
}
