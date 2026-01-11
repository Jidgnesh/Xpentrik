import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { colors } from '../theme/colors';
import { splitExpense, getExpenseSplit, deleteSplit } from '../utils/splitting';

const SplitExpenseModal = ({ visible, onClose, expense, onSplitAdded }) => {
  const [people, setPeople] = useState([{ name: '', amount: '', paid: false }]);
  const [splitType, setSplitType] = useState('equal'); // 'equal' or 'custom'
  const [existingSplit, setExistingSplit] = useState(null);

  useEffect(() => {
    if (visible && expense) {
      loadExistingSplit();
    } else {
      setPeople([{ name: '', amount: '', paid: false }]);
      setSplitType('equal');
    }
  }, [visible, expense]);

  const loadExistingSplit = async () => {
    try {
      const split = await getExpenseSplit(expense.id);
      if (split) {
        setExistingSplit(split);
        setPeople(split.splits);
      }
    } catch (error) {
      console.error('Error loading split:', error);
    }
  };

  const addPerson = () => {
    setPeople([...people, { name: '', amount: '', paid: false }]);
  };

  const removePerson = (index) => {
    if (people.length > 1) {
      setPeople(people.filter((_, i) => i !== index));
    }
  };

  const updatePerson = (index, field, value) => {
    const updated = [...people];
    updated[index] = { ...updated[index], [field]: value };
    setPeople(updated);
  };

  const calculateEqualSplit = () => {
    const total = expense.amount;
    const perPerson = total / people.length;
    return people.map(p => ({ ...p, amount: perPerson.toFixed(2) }));
  };

  const handleSave = async () => {
    if (!expense) return;

    // Validate
    if (people.some(p => !p.name.trim())) {
      Alert.alert('Error', 'Please enter names for all people');
      return;
    }

    if (splitType === 'equal') {
      const splits = calculateEqualSplit();
      try {
        await splitExpense(expense.id, splits);
        Alert.alert('Success', 'Expense split saved!');
        onSplitAdded();
        onClose();
      } catch (error) {
        Alert.alert('Error', 'Failed to save split');
      }
    } else {
      // Custom split - validate amounts
      const total = people.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);
      if (Math.abs(total - expense.amount) > 0.01) {
        Alert.alert('Error', `Amounts must total ₹${expense.amount}`);
        return;
      }

      try {
        await splitExpense(expense.id, people.map(p => ({
          ...p,
          amount: parseFloat(p.amount || 0),
        })));
        Alert.alert('Success', 'Expense split saved!');
        onSplitAdded();
        onClose();
      } catch (error) {
        Alert.alert('Error', 'Failed to save split');
      }
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Split',
      'Are you sure you want to remove this split?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteSplit(expense.id);
              setExistingSplit(null);
              Alert.alert('Success', 'Split removed');
              onClose();
            } catch (error) {
              Alert.alert('Error', 'Failed to delete split');
            }
          },
        },
      ]
    );
  };

  if (!expense) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Split Expense</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.expenseInfo}>
            <Text style={styles.expenseDescription}>{expense.description}</Text>
            <Text style={styles.expenseAmount}>₹{expense.amount.toLocaleString('en-IN')}</Text>
          </View>

          <ScrollView style={styles.content}>
            {/* Split Type */}
            <View style={styles.splitTypeContainer}>
              <TouchableOpacity
                style={[styles.splitTypeButton, splitType === 'equal' && styles.splitTypeButtonActive]}
                onPress={() => setSplitType('equal')}
              >
                <Text style={[styles.splitTypeText, splitType === 'equal' && styles.splitTypeTextActive]}>
                  Equal Split
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.splitTypeButton, splitType === 'custom' && styles.splitTypeButtonActive]}
                onPress={() => setSplitType('custom')}
              >
                <Text style={[styles.splitTypeText, splitType === 'custom' && styles.splitTypeTextActive]}>
                  Custom Amounts
                </Text>
              </TouchableOpacity>
            </View>

            {/* People List */}
            <Text style={styles.sectionTitle}>People</Text>
            {people.map((person, index) => (
              <View key={index} style={styles.personRow}>
                <View style={styles.personInputs}>
                  <TextInput
                    style={styles.nameInput}
                    placeholder="Name"
                    value={person.name}
                    onChangeText={(text) => updatePerson(index, 'name', text)}
                    placeholderTextColor={colors.textMuted}
                  />
                  {splitType === 'custom' && (
                    <TextInput
                      style={styles.amountInput}
                      placeholder="Amount"
                      value={person.amount}
                      onChangeText={(text) => updatePerson(index, 'amount', text)}
                      keyboardType="decimal-pad"
                      placeholderTextColor={colors.textMuted}
                    />
                  )}
                  {splitType === 'equal' && (
                    <Text style={styles.equalAmount}>
                      ₹{(expense.amount / people.length).toFixed(2)}
                    </Text>
                  )}
                </View>
                {people.length > 1 && (
                  <TouchableOpacity
                    style={styles.removeButton}
                    onPress={() => removePerson(index)}
                  >
                    <Text style={styles.removeText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}

            <TouchableOpacity style={styles.addButton} onPress={addPerson}>
              <Text style={styles.addButtonText}>+ Add Person</Text>
            </TouchableOpacity>

            {existingSplit && (
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
                <Text style={styles.deleteButtonText}>🗑️ Remove Split</Text>
              </TouchableOpacity>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
            <Text style={styles.saveButtonText}>Save Split</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.backgroundSecondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeText: {
    fontSize: 20,
    color: colors.textMuted,
  },
  expenseInfo: {
    padding: 20,
    backgroundColor: colors.surface,
    margin: 20,
    borderRadius: 16,
  },
  expenseDescription: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  expenseAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: colors.primary,
  },
  content: {
    padding: 20,
    maxHeight: 400,
  },
  splitTypeContainer: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  splitTypeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  splitTypeButtonActive: {
    backgroundColor: colors.primary,
  },
  splitTypeText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  splitTypeTextActive: {
    color: colors.text,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: 12,
  },
  personRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  personInputs: {
    flex: 1,
    flexDirection: 'row',
    gap: 12,
  },
  nameInput: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: colors.text,
  },
  amountInput: {
    width: 100,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: colors.text,
  },
  equalAmount: {
    width: 100,
    textAlign: 'center',
    padding: 12,
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  removeButton: {
    padding: 8,
  },
  removeText: {
    fontSize: 18,
    color: colors.danger,
  },
  addButton: {
    backgroundColor: colors.primaryMuted,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  addButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.primary,
  },
  deleteButton: {
    backgroundColor: colors.dangerMuted,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  deleteButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.danger,
  },
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 20,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
});

export default SplitExpenseModal;
