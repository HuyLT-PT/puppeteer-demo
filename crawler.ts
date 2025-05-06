import puppeteer, { Page } from 'puppeteer';
import { PrismaClient } from './prisma';

const domainUrl = "https://congtytui1.com";
const prisma = new PrismaClient();

export type CommentItem = {
  id: string;
  text: string;
  type: string;
  sourceId: string;
};

async function launchBrowser() {
  return await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
}

async function getTotalPages(page: Page, companyName:string): Promise<number> {
  await page.goto(`${domainUrl}/companies/${companyName}`, { waitUntil: 'networkidle0' });

  return await page.evaluate(() => {
    const pageLinks = Array.from(document.querySelectorAll('.pagination .page-link'));

    const pageNumbers = pageLinks
      .map(link => {
        const text = link.textContent?.trim();
        const num = parseInt(text ?? '', 10);
        return isNaN(num) ? null : num;
      })
      .filter((num): num is number => num !== null);

    return Math.max(...pageNumbers, 1);
  });
}

async function scrapePage(page: Page, pageIndex: number,companyName:string): Promise<CommentItem[]> {
  const url = `${domainUrl}/companies/${companyName}?page=${pageIndex}`;
  const response = await page.goto(url, { waitUntil: 'networkidle0' });

  if (!response || response.status() >= 400) {
    console.warn(`❌ Page ${url} returned status ${response?.status()}`);
    return [];
  }

  const html = await page.content();
  if (html.trim() === '<html><head></head><body></body></html>') {
    console.warn(`⚠️ Empty page content at ${url}`);
    return [];
  }

  const pageTitle = await page.title();
  if (pageTitle.includes('404') || pageTitle.toLowerCase().includes('not found')) {
    console.warn(`🚫 Page title indicates 404: ${pageTitle}`);
    return [];
  }
  return await page.evaluate(() => {
    const results: CommentItem[] = [];
    const containers = Array.from(document.querySelectorAll('div[id^="comment-replies-"], div[id^="review-"]'));

    containers.forEach(container => {
      const fullId = container.id;
      let type = '';
      let id = '';

      if (fullId.startsWith('comment-replies-')) {
        type = 'comment';
        id = fullId.replace('comment-replies-', '');
      } else if (fullId.startsWith('review-')) {
        type = 'review';
        id = fullId.replace('review-', '');
      }

      const contentEl = container.querySelector('.cmt-content, .readmore-content');
      const text = contentEl?.textContent?.trim() || '';

      if (text) {
        results.push({ sourceId: id, type, text, id: fullId });
      }
    });

    return results;
  });
}

async function saveToDatabase(comments: CommentItem[],companyName:string) {
  for (const item of comments.reverse()) {
    await prisma.comment.upsert({
      where: { id: item.id },
      update: {
        text: item.text,
        type: item.type,
        sourceId: item.sourceId,
      },
      create: {
        id: item.id,
        text: item.text,
        type: item.type,
        sourceId: item.sourceId,
        companyId: companyName
      }
    });
  }
}

export async function crawlComments(companyName:string)  {
  const browser = await launchBrowser();
  const page = await browser.newPage();
  const totalPages = await getTotalPages(page,companyName);

  const allComments: CommentItem[] = [];

  for (let pageIndex = 1; pageIndex <= totalPages; pageIndex++) {
    const comments = await scrapePage(page, pageIndex,companyName);
    if(comments.length){
      allComments.push(...comments);
    }
  }

  await browser.close();
  await saveToDatabase(allComments,companyName);
  await prisma.$disconnect();

  console.log(`✅ Crawled and saved ${allComments.length} comments`);

  return  {
    total:allComments.length,
    allComments : allComments.reverse()
  }
};
