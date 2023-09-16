import { QualWeb, generateEARLReport, EvaluationReport, QualwebOptions } from '@qualweb/core';
import { EarlOptions } from '@qualweb/earl-reporter';
import parse from './lib/parser';
import { saveReport } from './lib/fileUtils';
import { printHelp } from './lib/parserUtils';

async function cli(): Promise<void> {
  try {
    const options = await parse();

    const qualweb = new QualWeb({ adBlock: true, stealth: true });

    await qualweb.start(
      { maxConcurrency: options.maxParallelEvaluations, timeout: options.timeout },
      { args: ['--no-sandbox', '--ignore-certificate-errors'] }
    );

    if (!options['wcag-techniques']) {
      options['wcag-techniques'] = {};
    }

    options['wcag-techniques'].exclude = ['QW-WCAG-T16'];

    const reports = await qualweb.evaluate(options);
    await qualweb.stop();

    await handleReporting(reports, options);
  } catch (err) {
    if (err instanceof Error && err.message === 'Invalid input method') {
      printHelp();
    } else {
      console.error(err);
    }
  }

  process.exit(0);
}

async function handleReporting(reports: { [url: string]: EvaluationReport }, options: QualwebOptions): Promise<void> {
  const reportType = options.report;
  const saveName = options['save-name'];
  delete options.report;
  delete options['save-name'];

  if (reportType) {
    if (reportType === 'earl') {
      await saveEarlReports(reports, saveName);
    } else if (reportType === 'earl-a') {
      const earlOptions = checkEarlOptions(options, saveName);
      const earlReport = generateEARLReport(reports, earlOptions);
      const name = Object.keys(earlReport)[0];
      await saveReport(name, earlReport[name], !!saveName);
    } else {
      throw new Error('Invalid reporter format');
    }
  } else {
    await saveReports(reports, saveName);
  }
}

async function saveEarlReports(reports: { [url: string]: EvaluationReport }, saveName?: string): Promise<void> {
  const earlReports = generateEARLReport(reports);
  let index = 0;
  for (const url in earlReports || {}) {
    if (saveName) {
      const filename = computeFilename(saveName, url, index);
      await saveReport(filename, earlReports[url], true);
    } else {
      await saveReport(url, earlReports[url]);
    }
    index++;
  }
}

async function saveReports(reports: { [url: string]: EvaluationReport }, saveName?: string): Promise<void> {
  let index = 0;
  for (const url in reports ?? {}) {
    const report = <EvaluationReport>reports[url];
    if (saveName) {
      const filename = computeFilename(saveName, url, index);
      await saveReport(filename, report, true);
    } else {
      await saveReport(url, report);
    }
    index++;
  }
}

function computeFilename(saveName: string, url: string, index: number): string {
  return saveName
    .replace('%index%', index.toFixed().padStart(3, '0'))
    .replace('%url%', encodeURIComponent(url))
    .replace('%time%', new Date().getTime().toFixed());
}

function checkEarlOptions(options: QualwebOptions, saveName?: string): EarlOptions {
  const earlOptions: EarlOptions = { aggregated: true, aggregatedName: saveName };
  if (options.execute) {
    earlOptions.modules = {};
    earlOptions.modules.act = !!options?.execute?.act;
    earlOptions.modules.wcag = !!options?.execute?.wcag;
    earlOptions.modules['best-practices'] = !!options?.execute?.bp;
  }

  return earlOptions;
}

export = cli;
