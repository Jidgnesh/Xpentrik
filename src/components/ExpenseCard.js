import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../theme/colors';
import { DEFAULT_CATEGORIES } from '../utils/storage';
import { format } from 'date-fns';

const ExpenseCard = ({ expense, onPress, onLongPress, style }) => {
  const category = DEFAULT_CATEGORIES.find(c => c.id === expense.category) || DEFAULT_CATEGORIES[DEFAULT_CATEGORIES.length - 1];
  const formattedDate = format(new Date(expense.date || expense.createdAt), 'MMM dd, h:mm a');
  const formattedAmount = expense.amount.toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return (
    <TouchableOpacity 
      onPress={onPress} 
      onLongPress={onLongPress}
      activeOpacity={0.7}
      style={[styles.container, style]}
    >
      <View style={styles.card}>
        {/* Category Icon */}
        <View style={[styles.iconContainer, { backgroundColor: `${category.color}20` }]}>
          <Text style={styles.icon}>{category.icon}</Text>
        </View>

        {/* Details */}
        <View style={styles.details}>
          <Text style={styles.description} numberOfLines={1}>
            {expense.description || category.name}
          </Text>
          <View style={styles.metaRow}>
            <Text style={styles.category}>{category.name}</Text>
            {expense.source === 'sms' && (
              <View style={styles.smsBadge}>
                <Text style={styles.smsBadgeText}>SMS</Text>
              </View>
            )}
          </View>
          <Text style={styles.date}>{formattedDate}</Text>
        </View>

        {/* Amount */}
        <View style={styles.amountContainer}>
          <Text style={styles.currency}>₹</Text>
          <Text style={[
            styles.amount,
            expense.isIncome && styles.incomeAmount
          ]}>
            {expense.isIncome ? `+${formattedAmount}` : formattedAmount}
          </Text>
        </View>
      </View>

      {/* Accent line */}
      <View style={[styles.accentLine, { backgroundColor: category.color }]} />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 16,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 16,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  icon: {
    fontSize: 24,
  },
  details: {
    flex: 1,
    marginRight: 12,
  },
  description: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  category: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  smsBadge: {
    backgroundColor: colors.primaryMuted,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  smsBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.primary,
  },
  date: {
    fontSize: 12,
    color: colors.textMuted,
  },
  amountContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  currency: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primary,
    marginRight: 2,
    marginTop: 2,
  },
  amount: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  incomeAmount: {
    color: '#00E676', // Green for income
  },
  accentLine: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
  },
});

export default ExpenseCard;

