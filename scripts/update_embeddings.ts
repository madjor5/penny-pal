import { db } from '../server/db';
import { receiptItems } from '../shared/schema';
import { generateEmbedding } from '../server/openai';
import { eq, sql } from 'drizzle-orm';

async function updateEmbeddings() {
  console.log('🔄 Generating embeddings for all receipt items...');
  
  try {
    // Get all items without embeddings
    const items = await db.select()
      .from(receiptItems)
      .where(sql`${receiptItems.embedding} IS NULL`);
    
    console.log(`Found ${items.length} items without embeddings`);
    
    for (const item of items) {
      try {
        console.log(`Generating embedding for: ${item.itemDescription}`);
        const embedding = await generateEmbedding(item.itemDescription);
        
        if (embedding.length > 0) {
          await db.update(receiptItems)
            .set({ embedding: embedding })
            .where(eq(receiptItems.id, item.id));
          
          console.log(`✅ Updated embedding for: ${item.itemDescription} (${embedding.length} dimensions)`);
        } else {
          console.log(`❌ No embedding generated for: ${item.itemDescription}`);
        }
      } catch (error) {
        console.error(`❌ Failed to generate embedding for: ${item.itemDescription}`, error);
      }
    }
    
    console.log('🎉 Finished generating embeddings!');
    
    // Verify results
    const updatedItems = await db.select()
      .from(receiptItems)
      .where(sql`${receiptItems.embedding} IS NOT NULL`);
    
    console.log(`✅ ${updatedItems.length} items now have embeddings`);
    
  } catch (error) {
    console.error('Error in updateEmbeddings:', error);
  }
}

updateEmbeddings().then(() => {
  console.log('Embedding update complete');
  process.exit(0);
}).catch(console.error);