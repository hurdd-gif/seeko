import { Hono } from 'hono';
import { createAgentRoutes, type AgentChatInput, type AgentChatResult } from './routes/agent';
import { createAdminRoutes } from './routes/admin';
import { createAgreementRoutes, type AgreementIndexData } from './routes/agreement';
import { createAuthCallbackRoutes, createAuthRoutes, createPasskeyLoginRoutes } from './routes/auth';
import { createDashboardRoutes } from './routes/dashboard';
import { createDocShareRoutes } from './routes/doc-share';
import { createDocsRoutes } from './routes/docs';
import { createExternalSigningAdminRoutes } from './routes/external-signing-admin';
import { createExternalSigningRoutes } from './routes/external-signing';
import { createInvoiceRoutes } from './routes/invoice';
import { createInvestorRoutes } from './routes/investor';
import { createContractorRoutes } from './routes/contractor';
import { createPaymentsRoutes } from './routes/payments';
import { createProfileRoutes } from './routes/profile';
import { createTasksRoutes } from './routes/tasks';
import { createTeamRoutes } from './routes/team';
import { createWorkflowRoutes } from './routes/workflow';
import type { Context } from 'hono';
import { loadDocShare, type DocShareLoadResult } from '@/lib/doc-share';
import {
  loadDocsIndex,
  type DocsIndexData,
} from '@/lib/docs-index';
import {
  loadExternalSigningAdminIndex,
  type ExternalSigningAdminData,
} from '@/lib/external-signing-admin';
import {
  loadExternalSigningInvite,
  type ExternalSigningLoadResult,
} from '@/lib/external-signing';
import {
  loadInvoiceRequest,
  type InvoiceRequestLoadResult,
} from '@/lib/invoice-request';
import {
  loadInvestorDocs,
  loadInvestorOverview,
  loadInvestorPayments,
  loadInvestorSettings,
  updateInvestorSettings,
  type InvestorDocsData,
  type InvestorOverviewData,
  type InvestorPaymentsData,
  type InvestorSettingsData,
  type InvestorSettingsInput,
} from '@/lib/investor-index';
import {
  loadContractorOverview,
  type ContractorOverviewData,
} from '@/lib/contractor-index';
import {
  completeOnboardingProfile,
  loadOnboardingProfile,
  type CompleteOnboardingInput,
  type OnboardingData,
} from '@/lib/onboarding-index';
import {
  loadPaymentsIndex,
  type PaymentsIndexData,
} from '@/lib/payments-index';
import {
  loadTasksIndex,
  loadTaskDetail,
  type TaskDetailData,
  type TasksIndexData,
} from '@/lib/tasks-index';
import {
  loadTeamRoster,
  type TeamRosterData,
} from '@/lib/team-roster';
import type { PaymentsAuthResult } from './payments-auth';
import type { AuthenticatedUser } from './supabase';
import type { AuthGuard } from './auth-utils';

type ApiDependencies = {
  agentAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  agentRunner?: (input: AgentChatInput, user: AuthenticatedUser) => Promise<AgentChatResult>;
  authSignOut?: (c: Context) => Promise<void>;
  agreementAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  agreementLoader?: (user: AuthenticatedUser) => Promise<AgreementIndexData>;
  agreementSigner?: (
    c: Context,
    user: AuthenticatedUser,
    input: { full_name?: string; address?: string; engagement_type?: string },
  ) => Promise<{ success: true; redirect: string }>;
  docShareLoader?: (token: string) => Promise<DocShareLoadResult>;
  docsAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  docsIndexLoader?: (user: AuthenticatedUser) => Promise<DocsIndexData>;
  externalSigningAdminAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  externalSigningAdminLoader?: (user: AuthenticatedUser) => Promise<ExternalSigningAdminData>;
  externalSigningLoader?: (token: string) => Promise<ExternalSigningLoadResult>;
  invoiceLoader?: (token: string, sessionToken?: string | null) => Promise<InvoiceRequestLoadResult>;
  investorAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  investorDocsLoader?: (user: AuthenticatedUser) => Promise<InvestorDocsData>;
  investorOverviewLoader?: (user: AuthenticatedUser) => Promise<InvestorOverviewData>;
  investorPaymentsLoader?: (user: AuthenticatedUser) => Promise<InvestorPaymentsData>;
  investorSettingsLoader?: (user: AuthenticatedUser) => Promise<InvestorSettingsData>;
  investorSettingsUpdater?: (user: AuthenticatedUser, input: InvestorSettingsInput) => Promise<InvestorSettingsData>;
  contractorAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  contractorOverviewLoader?: (user: AuthenticatedUser) => Promise<ContractorOverviewData>;
  paymentsAuthResolver?: (c: Context) => Promise<PaymentsAuthResult>;
  paymentsIndexLoader?: (user: { id: string; email?: string | null }) => Promise<PaymentsIndexData>;
  profileAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  onboardingLoader?: (user: AuthenticatedUser) => Promise<OnboardingData>;
  onboardingUpdater?: (user: AuthenticatedUser, input: CompleteOnboardingInput) => Promise<OnboardingData>;
  taskDetailLoader?: (user: AuthenticatedUser, taskId: string) => Promise<TaskDetailData>;
  tasksAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  tasksIndexLoader?: (user: AuthenticatedUser) => Promise<TasksIndexData>;
  teamAuthResolver?: (c: Context) => Promise<AuthenticatedUser | null>;
  teamLoader?: (user: AuthenticatedUser) => Promise<TeamRosterData>;
  workflowUserGuard?: (c: Context) => Promise<AuthGuard>;
  workflowAdminGuard?: (c: Context) => Promise<AuthGuard>;
};

export function createApiApp(dependencies: ApiDependencies = {}) {
  const docShareLoader = dependencies.docShareLoader ?? loadDocShare;
  const docsIndexLoader = dependencies.docsIndexLoader ?? loadDocsIndex;
  const externalSigningAdminLoader = dependencies.externalSigningAdminLoader ?? loadExternalSigningAdminIndex;
  const externalSigningLoader = dependencies.externalSigningLoader ?? loadExternalSigningInvite;
  // Adapt loadInvoiceRequest's options-object signature to the positional
  // (token, sessionToken) shape the invoice routes call with.
  const invoiceLoader =
    dependencies.invoiceLoader ??
    ((token: string, sessionToken?: string | null) => loadInvoiceRequest(token, { sessionToken }));
  const investorDocsLoader = dependencies.investorDocsLoader ?? loadInvestorDocs;
  const investorOverviewLoader = dependencies.investorOverviewLoader ?? loadInvestorOverview;
  const investorPaymentsLoader = dependencies.investorPaymentsLoader ?? loadInvestorPayments;
  const investorSettingsLoader = dependencies.investorSettingsLoader ?? loadInvestorSettings;
  const investorSettingsUpdater = dependencies.investorSettingsUpdater ?? updateInvestorSettings;
  const contractorOverviewLoader = dependencies.contractorOverviewLoader ?? loadContractorOverview;
  const onboardingLoader = dependencies.onboardingLoader ?? loadOnboardingProfile;
  const onboardingUpdater = dependencies.onboardingUpdater ?? completeOnboardingProfile;
  const paymentsIndexLoader = dependencies.paymentsIndexLoader ?? loadPaymentsIndex;
  const taskDetailLoader = dependencies.taskDetailLoader ?? loadTaskDetail;
  const tasksIndexLoader = dependencies.tasksIndexLoader ?? loadTasksIndex;
  const teamLoader = dependencies.teamLoader ?? loadTeamRoster;

  return new Hono()
    .route('/auth', createAuthRoutes({ signOut: dependencies.authSignOut }))
    .route('/api/auth', createAuthCallbackRoutes())
    .route('/api/auth', createPasskeyLoginRoutes())
    .route('/api', createAdminRoutes())
    .route('/api', createAgentRoutes({
      authResolver: dependencies.agentAuthResolver,
      agentRunner: dependencies.agentRunner,
    }))
    .route('/api', createAgreementRoutes({
      authResolver: dependencies.agreementAuthResolver,
      agreementLoader: dependencies.agreementLoader,
      agreementSigner: dependencies.agreementSigner,
    }))
    .route('/api', createDashboardRoutes())
    .route('/api', createDocShareRoutes({ docShareLoader }))
    .route('/api', createDocsRoutes({ authResolver: dependencies.docsAuthResolver, docsIndexLoader }))
    .route('/api', createExternalSigningAdminRoutes({
      authResolver: dependencies.externalSigningAdminAuthResolver,
      externalSigningAdminLoader,
    }))
    .route('/api', createExternalSigningRoutes({
      authResolver: dependencies.externalSigningAdminAuthResolver,
      externalSigningLoader,
    }))
    .route('/api', createInvoiceRoutes({ invoiceLoader }))
    .route('/api', createInvestorRoutes({
      authResolver: dependencies.investorAuthResolver,
      investorDocsLoader,
      investorOverviewLoader,
      investorPaymentsLoader,
      investorSettingsLoader,
      investorSettingsUpdater,
    }))
    .route('/api', createContractorRoutes({
      authResolver: dependencies.contractorAuthResolver,
      contractorOverviewLoader,
    }))
    .route('/api', createPaymentsRoutes({ paymentsAuthResolver: dependencies.paymentsAuthResolver, paymentsIndexLoader }))
    .route('/api', createProfileRoutes({
      authResolver: dependencies.profileAuthResolver,
      onboardingLoader,
      onboardingUpdater,
    }))
    .route('/api', createTasksRoutes({ authResolver: dependencies.tasksAuthResolver, taskDetailLoader, tasksIndexLoader }))
    .route('/api', createTeamRoutes({ authResolver: dependencies.teamAuthResolver, teamLoader }))
    .route('/api', createWorkflowRoutes({
      userGuard: dependencies.workflowUserGuard,
      adminGuard: dependencies.workflowAdminGuard,
    }))
    .get('/api/health', (c) =>
      c.json({
        ok: true,
        service: 'seeko-api',
        runtime: 'hono',
      })
    );
}

export const app = createApiApp();

export type ApiApp = typeof app;
