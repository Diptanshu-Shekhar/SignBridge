import pandas as pd

df = pd.read_csv('model/landmarks.csv', low_memory=False)
print("Before fix:", df['label'].value_counts())

# Convert all labels to string
df['label'] = df['label'].astype(str)

# Remove any rows where label is literally 'label' (duplicate headers)
df = df[df['label'] != 'label']

print("After fix:", df['label'].value_counts())
df.to_csv('model/landmarks.csv', index=False)
print("Fixed and saved successfully")