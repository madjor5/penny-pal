const { db } = require('../server/db.ts');
const { accounts, transactions, budgets, savingsGoals, receiptItems } = require('../shared/schema.ts');
const { generateEmbedding, categorizeTransaction } = require('../server/openai.ts');

// Family of 4 realistic financial data generator
async function generateFamilyData() {
  console.log('🏠 Creating comprehensive family financial data for 2025...');

  // 1. Create family accounts
  console.log('📊 Creating family accounts...');
  const familyAccounts = await db.insert(accounts).values([
    {
      name: 'Family Budget Account',
      type: 'budget',
      balance: '8500.00'
    },
    {
      name: 'Credit Card - Main',
      type: 'expenses', 
      balance: '2847.32'
    },
    {
      name: 'Emergency Fund',
      type: 'savings',
      balance: '15000.00'
    },
    {
      name: 'Vacation Savings',
      type: 'savings',
      balance: '3200.00'
    }
  ]).returning();

  const [budgetAccount, expensesAccount, emergencyAccount, vacationAccount] = familyAccounts;

  // 2. Create realistic budgets
  console.log('💰 Setting up family budgets...');
  await db.insert(budgets).values([
    { name: 'Groceries', category: 'groceries', amount: '800.00', accountId: budgetAccount.id },
    { name: 'Dining Out', category: 'dining', amount: '300.00', accountId: budgetAccount.id },
    { name: 'Gas & Transportation', category: 'transportation', amount: '400.00', accountId: budgetAccount.id },
    { name: 'Entertainment', category: 'entertainment', amount: '200.00', accountId: budgetAccount.id },
    { name: 'Shopping', category: 'shopping', amount: '500.00', accountId: budgetAccount.id },
    { name: 'Healthcare', category: 'healthcare', amount: '300.00', accountId: budgetAccount.id },
    { name: 'Utilities', category: 'utilities', amount: '250.00', accountId: budgetAccount.id }
  ]);

  // 3. Create savings goals
  console.log('🎯 Setting up savings goals...');
  await db.insert(savingsGoals).values([
    {
      name: 'Emergency Fund',
      targetAmount: '20000.00',
      currentAmount: '15000.00',
      targetDate: new Date('2025-12-31'),
      accountId: emergencyAccount.id
    },
    {
      name: 'Summer Vacation 2025',
      targetAmount: '5000.00', 
      currentAmount: '3200.00',
      targetDate: new Date('2025-07-01'),
      accountId: vacationAccount.id
    },
    {
      name: 'Kids College Fund',
      targetAmount: '50000.00',
      currentAmount: '12500.00',
      targetDate: new Date('2030-09-01'),
      accountId: emergencyAccount.id
    }
  ]);

  // 4. Generate realistic transactions with receipt data
  console.log('🛒 Generating year-long transaction history...');
  
  const groceryStores = ['Whole Foods Market', 'Trader Joes', 'Safeway', 'Costco', 'Target'];
  const restaurants = ['Chipotle', 'Olive Garden', 'Starbucks', 'McDonalds', 'Subway', 'Panda Express'];
  const gasStations = ['Shell', 'Chevron', 'Exxon', 'BP'];
  const retailers = ['Amazon', 'Target', 'Walmart', 'Best Buy', 'Home Depot'];

  // Grocery items with realistic prices
  const groceryItems = [
    { item: 'Organic Bananas 3 lbs', price: 3.99, category: 'groceries' },
    { item: 'Ground Turkey 1 lb', price: 6.99, category: 'groceries' },
    { item: 'Whole Milk 1 Gallon', price: 4.29, category: 'groceries' },
    { item: 'Starbucks Pike Place Coffee K-Cups', price: 12.99, category: 'groceries' },
    { item: 'Greek Yogurt - Chobani Variety Pack', price: 5.99, category: 'groceries' },
    { item: 'Fresh Salmon Fillet 1.5 lbs', price: 18.99, category: 'groceries' },
    { item: 'Organic Baby Spinach', price: 4.49, category: 'groceries' },
    { item: 'Avocados - Organic 4 pack', price: 5.98, category: 'groceries' },
    { item: 'Sourdough Bread Loaf', price: 3.79, category: 'groceries' },
    { item: 'Free Range Eggs Dozen', price: 4.99, category: 'groceries' },
    { item: 'Folgers Classic Roast Coffee 30.5oz', price: 8.99, category: 'groceries' },
    { item: 'Chicken Breast Family Pack 3 lbs', price: 15.99, category: 'groceries' },
    { item: 'Coca Cola 12 Pack Cans', price: 6.99, category: 'groceries' },
    { item: 'Honey Nut Cheerios Cereal', price: 4.99, category: 'groceries' },
    { item: 'Roma Tomatoes 2 lbs', price: 3.98, category: 'groceries' }
  ];

  const restaurantItems = [
    { item: 'Burrito Bowl with Chicken', price: 9.75, category: 'dining' },
    { item: 'Venti Pike Place Coffee', price: 2.65, category: 'dining' },
    { item: 'Grande Caramel Macchiato', price: 5.45, category: 'dining' },
    { item: 'Big Mac Meal Large', price: 12.99, category: 'dining' },
    { item: 'Footlong Turkey Sub', price: 8.50, category: 'dining' },
    { item: 'Orange Chicken Family Meal', price: 24.99, category: 'dining' }
  ];

  const retailItems = [
    { item: 'iPhone Charging Cable', price: 19.99, category: 'shopping' },
    { item: 'Kids Winter Jacket Size 8', price: 45.99, category: 'shopping' },
    { item: 'Bluetooth Wireless Headphones', price: 79.99, category: 'shopping' },
    { item: 'Kitchen Paper Towels 12 Pack', price: 24.99, category: 'shopping' },
    { item: 'School Supplies Bundle', price: 32.47, category: 'shopping' }
  ];

  // Generate transactions from January 1 to August 26, 2025
  const startDate = new Date('2025-01-01');
  const endDate = new Date('2025-08-26');
  
  for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
    const dayOfWeek = date.getDay();
    
    // More transactions on weekends, fewer on weekdays
    const transactionProbability = dayOfWeek === 0 || dayOfWeek === 6 ? 0.8 : 0.6;
    
    if (Math.random() < transactionProbability) {
      // Grocery shopping (2-3 times per week)
      if (Math.random() < 0.4) {
        const store = groceryStores[Math.floor(Math.random() * groceryStores.length)];
        const numItems = Math.floor(Math.random() * 8) + 3; // 3-10 items
        const selectedItems = [];
        const totalAmount = [];
        
        for (let i = 0; i < numItems; i++) {
          const item = groceryItems[Math.floor(Math.random() * groceryItems.length)];
          selectedItems.push(item);
          totalAmount.push(parseFloat(item.price));
        }
        
        const total = totalAmount.reduce((sum, price) => sum + price, 0);
        
        const transaction = await db.insert(transactions).values({
          accountId: expensesAccount.id,
          description: `Grocery shopping at ${store}`,
          amount: total.toFixed(2),
          category: 'groceries',
          merchant: store,
          date: new Date(date)
        }).returning();

        // Add receipt items with embeddings
        for (const item of selectedItems) {
          const embedding = await generateEmbedding(item.item);
          await db.insert(receiptItems).values({
            transactionId: transaction[0].id,
            itemDescription: item.item,
            itemAmount: item.price.toFixed(2),
            itemCategory: item.category,
            embedding: embedding
          });
        }
        console.log(`✅ Added grocery transaction: ${store} - $${total.toFixed(2)}`);
      }

      // Dining out (2-4 times per week)
      if (Math.random() < 0.5) {
        const restaurant = restaurants[Math.floor(Math.random() * restaurants.length)];
        const items = [];
        const isStarbucks = restaurant === 'Starbucks';
        
        if (isStarbucks) {
          // Coffee orders typically 1-2 items
          const coffeeItems = restaurantItems.filter(item => item.item.includes('Coffee') || item.item.includes('Macchiato'));
          items.push(coffeeItems[Math.floor(Math.random() * coffeeItems.length)]);
          if (Math.random() < 0.3) items.push(coffeeItems[Math.floor(Math.random() * coffeeItems.length)]);
        } else {
          // Regular restaurant 1-3 items
          const numItems = Math.floor(Math.random() * 3) + 1;
          for (let i = 0; i < numItems; i++) {
            const item = restaurantItems[Math.floor(Math.random() * restaurantItems.length)];
            items.push(item);
          }
        }
        
        const total = items.reduce((sum, item) => sum + item.price, 0);
        
        const transaction = await db.insert(transactions).values({
          accountId: expensesAccount.id,
          description: `Dining at ${restaurant}`,
          amount: total.toFixed(2),
          category: 'dining',
          merchant: restaurant,
          date: new Date(date)
        }).returning();

        // Add receipt items with embeddings
        for (const item of items) {
          const embedding = await generateEmbedding(item.item);
          await db.insert(receiptItems).values({
            transactionId: transaction[0].id,
            itemDescription: item.item,
            itemAmount: item.price.toFixed(2),
            itemCategory: item.category,
            embedding: embedding
          });
        }
        console.log(`🍽️ Added dining transaction: ${restaurant} - $${total.toFixed(2)}`);
      }

      // Gas (once per week)
      if (Math.random() < 0.15) {
        const station = gasStations[Math.floor(Math.random() * gasStations.length)];
        const amount = (Math.random() * 40 + 35).toFixed(2); // $35-75
        
        const transaction = await db.insert(transactions).values({
          accountId: expensesAccount.id,
          description: `Gas fill-up at ${station}`,
          amount: amount,
          category: 'transportation',
          merchant: station,
          date: new Date(date)
        }).returning();

        const embedding = await generateEmbedding('Gasoline fuel fill-up');
        await db.insert(receiptItems).values({
          transactionId: transaction[0].id,
          itemDescription: 'Gasoline fuel fill-up',
          itemAmount: amount,
          itemCategory: 'transportation',
          embedding: embedding
        });
        console.log(`⛽ Added gas transaction: ${station} - $${amount}`);
      }

      // Retail shopping (1-2 times per week)
      if (Math.random() < 0.25) {
        const retailer = retailers[Math.floor(Math.random() * retailers.length)];
        const numItems = Math.floor(Math.random() * 3) + 1;
        const selectedItems = [];
        
        for (let i = 0; i < numItems; i++) {
          const item = retailItems[Math.floor(Math.random() * retailItems.length)];
          selectedItems.push(item);
        }
        
        const total = selectedItems.reduce((sum, item) => sum + item.price, 0);
        
        const transaction = await db.insert(transactions).values({
          accountId: expensesAccount.id,
          description: `Shopping at ${retailer}`,
          amount: total.toFixed(2),
          category: 'shopping',
          merchant: retailer,
          date: new Date(date)
        }).returning();

        // Add receipt items with embeddings
        for (const item of selectedItems) {
          const embedding = await generateEmbedding(item.item);
          await db.insert(receiptItems).values({
            transactionId: transaction[0].id,
            itemDescription: item.item,
            itemAmount: item.price.toFixed(2),
            itemCategory: item.category,
            embedding: embedding
          });
        }
        console.log(`🛍️ Added shopping transaction: ${retailer} - $${total.toFixed(2)}`);
      }
    }
  }

  // Add some monthly recurring transactions
  console.log('🔄 Adding recurring monthly transactions...');
  for (let month = 0; month < 8; month++) { // Jan through Aug
    const monthDate = new Date(2025, month, 15); // 15th of each month
    
    // Utilities
    await db.insert(transactions).values({
      accountId: expensesAccount.id,
      description: 'Electric & Gas Bill',
      amount: (Math.random() * 50 + 150).toFixed(2),
      category: 'utilities',
      merchant: 'PG&E',
      date: monthDate
    });

    // Internet
    await db.insert(transactions).values({
      accountId: expensesAccount.id,
      description: 'Internet Service',
      amount: '89.99',
      category: 'utilities',
      merchant: 'Comcast',
      date: monthDate
    });

    // Phone bill
    await db.insert(transactions).values({
      accountId: expensesAccount.id,
      description: 'Mobile Phone Service Family Plan',
      amount: '145.00',
      category: 'utilities',
      merchant: 'Verizon',
      date: monthDate
    });
  }

  console.log('🎉 Family financial data generation complete!');
  console.log('📊 Generated realistic transactions with receipt items and embeddings');
  console.log('🔍 Ready for semantic search testing!');
}

generateFamilyData().catch(console.error);