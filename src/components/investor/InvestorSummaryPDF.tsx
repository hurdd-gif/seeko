'use client';

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from '@react-pdf/renderer';
import type { InvestorSummaryPDFData } from '@/lib/investor-summary-pdf-data';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    paddingTop: 48,
    paddingHorizontal: 40,
    paddingBottom: 40,
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: '#000000',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    backgroundColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  headerLogo: {
    height: 24,
    width: 'auto',
  },
  headerText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: '#333333',
    marginBottom: 2,
  },
  meta: {
    fontSize: 9,
    color: '#666666',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#000000',
    marginTop: 14,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#000000',
    paddingBottom: 2,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e5e5',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  bulletList: {
    marginTop: 4,
  },
  bulletItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  bullet: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#000000',
    marginTop: 5,
    marginRight: 8,
  },
  callout: {
    backgroundColor: '#f5f5f5',
    borderLeftWidth: 3,
    borderLeftColor: '#000000',
    padding: 10,
    marginTop: 10,
  },
  calloutDanger: {
    borderLeftColor: '#b91c1c',
  },
  calloutWarn: {
    borderLeftColor: '#b45309',
  },
});

interface InvestorSummaryPDFProps {
  data: InvestorSummaryPDFData;
  logoSrc: string | null;
}

export function InvestorSummaryPDF({ data, logoSrc }: InvestorSummaryPDFProps) {
  const dateStr = new Date(data.generatedAt).toLocaleDateString(undefined, {
    dateStyle: 'medium',
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header — black bar, white logo or wordmark */}
        <View style={styles.header} fixed>
          {logoSrc ? (
            <Image src={logoSrc} style={styles.headerLogo} />
          ) : (
            <Text style={styles.headerText}>SEEKO</Text>
          )}
        </View>

        <Text style={styles.title}>Investor Summary</Text>
        <Text style={styles.subtitle}>Current state of SEEKO — {dateStr}</Text>
        {data.lastUpdated && (
          <Text style={styles.meta}>Updated {data.lastUpdated}</Text>
        )}
        {data.atAGlance && (
          <Text style={styles.meta}>{data.atAGlance}</Text>
        )}
        {data.teamCount > 0 && (
          <Text style={styles.meta}>
            Team: {data.teamCount} {data.teamCount === 1 ? 'person' : 'people'}
          </Text>
        )}
        {data.phaseSummary && (
          <Text style={styles.meta}>Phases: {data.phaseSummary}</Text>
        )}

        {/* Game Areas */}
        <Text style={styles.sectionTitle}>Game Areas</Text>
        {data.areas.length === 0 ? (
          <Text style={styles.subtitle}>No game areas yet.</Text>
        ) : (
          data.areas.map((area, i) => (
            <View key={i} style={[styles.row, i === data.areas.length - 1 ? styles.rowLast : {}]}>
              <View>
                <Text style={{ fontWeight: 'bold' }}>{area.name}</Text>
                <Text style={styles.meta}>
                  {[area.phase, area.status].filter(Boolean).join(' · ')} · {area.progress}%
                </Text>
              </View>
            </View>
          ))
        )}

        {/* Recent Tasks */}
        <Text style={styles.sectionTitle}>Recent Tasks</Text>
        {data.recentTasks.length === 0 ? (
          <Text style={styles.subtitle}>No tasks yet.</Text>
        ) : (
          data.recentTasks.map((task, i) => (
            <View key={i} style={[styles.row, i === data.recentTasks.length - 1 ? styles.rowLast : {}]}>
              <Text style={{ flex: 1 }}>{task.name}</Text>
              <Text style={styles.meta}>
                {[task.status, task.assignee, task.due].filter(Boolean).join(' · ')}
              </Text>
            </View>
          ))
        )}

        {/* This Week */}
        <Text style={styles.sectionTitle}>This Week</Text>
        {data.updates.length === 0 ? (
          <Text style={styles.subtitle}>No updates yet.</Text>
        ) : (
          <View style={styles.bulletList}>
            {data.updates.map((bullet, i) => (
              <View key={i} style={styles.bulletItem}>
                <View style={styles.bullet} />
                <Text style={{ flex: 1 }}>{bullet}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Blocked */}
        {data.blocked > 0 && (
          <View style={[styles.callout, styles.calloutDanger]}>
            <Text>
              <Text style={{ fontWeight: 'bold' }}>{data.blocked} task{data.blocked !== 1 ? 's' : ''} blocked.</Text>
              {' '}The team is actively working to unblock progress.
            </Text>
          </View>
        )}

        {/* Overdue */}
        {data.overdueCount > 0 && (
          <View style={[styles.callout, styles.calloutWarn]}>
            <Text>
              <Text style={{ fontWeight: 'bold' }}>{data.overdueCount} task{data.overdueCount !== 1 ? 's' : ''} past due.</Text>
              {' '}The team is reprioritising and updating deadlines.
            </Text>
          </View>
        )}
      </Page>
    </Document>
  );
}
