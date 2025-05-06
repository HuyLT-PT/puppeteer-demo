import express from 'express';
import { crawlComments } from './crawler';
import morgan from 'morgan';
import path from 'path';

const app = express();
app.use(morgan('dev'));
app.use(express.static(path.join(__dirname, 'public')));
const port = process.env.PORT || 9999;

app.get('/health', (req, res) => {
  res.send('✅ Server is healthy');
});

app.get('/crawl-comments/:companyName', async (req, res) => {
  try {
    const { companyName } = req.params;
    const result = await crawlComments(companyName);
    res.json({
      success: true,
      message: `✅ Crawled and saved ${result.total} comments`,
      data: result.total > 0 ? result.allComments: []
    });
  } catch (error) {
    console.error('❌ Error during crawling:', error);
    res.status(500).json({
      success: false,
      message: 'Crawling failed',
      error: (error as Error).message,
    });
  }
});

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`🚀 Server is running on http://localhost:${port}`);
});
