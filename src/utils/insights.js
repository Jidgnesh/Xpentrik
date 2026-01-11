import { getExpenses, getSettings } from './storage';
import { startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay, isSameMonth, isSameDay } from 'date-fns';

/**
 * Get spending insights and trends
 */
export const getSpendingInsights = async () => {
  try {
    const expenses = await getExpenses();
    const settings = await getSettings();
    const now = new Date();
    
    // Filter out income
    const expenseOnly = expenses.filter(e => !e.isIncome);
    
    // Current month
    const currentMonthStart = startOfMonth(now);
    const currentMonthEnd = endOfMonth(now);
    const currentMonthExpenses = expenseOnly.filter(e => {
      const date = new Date(e.date || e.createdAt);
      return date >= currentMonthStart && date <= currentMonthEnd;
    });
    const currentMonthTotal = currentMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    
    // Last month
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));
    const lastMonthExpenses = expenseOnly.filter(e => {
      const date = new Date(e.date || e.createdAt);
      return date >= lastMonthStart && date <= lastMonthEnd;
    });
    const lastMonthTotal = lastMonthExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    
    // Calculate insights
    const monthOverMonthChange = lastMonthTotal > 0 
      ? ((currentMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 
      : 0;
    
    const budgetProgress = settings.monthlyBudget > 0 
      ? (currentMonthTotal / settings.monthlyBudget) * 100 
      : 0;
    
    const daysRemaining = Math.max(0, endOfMonth(now).getDate() - now.getDate());
    const averageDailySpend = currentMonthTotal / Math.max(1, now.getDate());
    const projectedMonthly = averageDailySpend * endOfMonth(now).getDate();
    
    // Top spending day
    const dayTotals = {};
    currentMonthExpenses.forEach(e => {
      const date = new Date(e.date || e.createdAt);
      const dayKey = date.toDateString();
      dayTotals[dayKey] = (dayTotals[dayKey] || 0) + (e.amount || 0);
    });
    const topDay = Object.entries(dayTotals).sort((a, b) => b[1] - a[1])[0];
    
    // Top category
    const categoryTotals = {};
    currentMonthExpenses.forEach(e => {
      const cat = e.category || 'other';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (e.amount || 0);
    });
    const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];
    
    // Spending velocity (how fast you're spending)
    const spendingVelocity = averageDailySpend;
    const budgetVelocity = settings.monthlyBudget / endOfMonth(now).getDate();
    const velocityStatus = spendingVelocity > budgetVelocity ? 'over' : spendingVelocity > budgetVelocity * 0.9 ? 'warning' : 'good';
    
    // Generate tips
    const tips = [];
    if (budgetProgress > 90) {
      tips.push('⚠️ You\'ve used over 90% of your budget. Consider reducing non-essential spending.');
    } else if (budgetProgress > 70) {
      tips.push('💡 You\'re at 70% of your budget. Keep an eye on your spending.');
    }
    
    if (monthOverMonthChange > 20) {
      tips.push('📈 Your spending increased significantly this month. Review your expenses.');
    } else if (monthOverMonthChange < -20) {
      tips.push('📉 Great! You spent less this month. Keep it up!');
    }
    
    if (projectedMonthly > settings.monthlyBudget) {
      tips.push(`💰 At this rate, you'll exceed your budget by ₹${(projectedMonthly - settings.monthlyBudget).toFixed(0)}.`);
    }
    
    if (topCategory && categoryTotals[topCategory[0]] > currentMonthTotal * 0.4) {
      tips.push(`🎯 ${topCategory[0]} accounts for over 40% of your spending. Consider reviewing this category.`);
    }
    
    return {
      currentMonthTotal,
      lastMonthTotal,
      monthOverMonthChange,
      budgetProgress,
      daysRemaining,
      averageDailySpend,
      projectedMonthly,
      topDay: topDay ? { date: topDay[0], amount: topDay[1] } : null,
      topCategory: topCategory ? { name: topCategory[0], amount: topCategory[1] } : null,
      spendingVelocity,
      budgetVelocity,
      velocityStatus,
      tips: tips.length > 0 ? tips : ['✅ Your spending looks good! Keep tracking your expenses.'],
      isOverBudget: budgetProgress >= 100,
      isNearBudget: budgetProgress >= 90 && budgetProgress < 100,
    };
  } catch (error) {
    console.error('Error getting insights:', error);
    return null;
  }
};
