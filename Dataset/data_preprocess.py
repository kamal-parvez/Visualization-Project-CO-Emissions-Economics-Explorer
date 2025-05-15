import pandas as pd

# Load CO2 Dataset
df_co2 = pd.read_csv("annual_co2_emissions_per_capita.csv", usecols=["Country", "Year", "Annual_CO2_Emissions_Per_Capita"])
# print(df_co2.head())

# Load Renewable Energy Dataset
df_renew = pd.read_csv("renewable_energy.csv", usecols=["Country", "Code", "Year", "Renewable_Energy_Percentage"])
# print(df_renew.head())

# Load GDP Dataset
df_gdp = pd.read_csv("gdp.csv", usecols=["Country", "Code", "Year", "GDP_Per_Capita"])
# print(df_gdp.head())

# Load Energt Use Dataset
df_energy_use = pd.read_csv("per-capita-energy-use.csv", usecols=["Country", "Code", "Year", "Energy_Consumption_Per_Capita"])
# print(df_energy_use.head())

# Load Population Dataset and Convert
df_pop = pd.read_csv("population.csv", skiprows=4)
year_cols = [col for col in df_pop.columns if col.isdigit()]

# Melt using only those columns as value_vars
df_pop = df_pop.melt(
    id_vars=["Country", "Code"],  # keep these
    value_vars=year_cols,                      # only the numeric-year columns
    var_name="Year",
    value_name="Population"
)

# Convert types safely
df_pop["Year"] = df_pop["Year"].astype(int)
df_pop = df_pop.dropna(subset=["Population"])
df_pop["Population"] = df_pop["Population"].astype(int)
# print(df_pop.head())

# build a lookup of ISO3 code → official name from df_gdp
code_to_name = dict(zip(df_gdp['Code'], df_gdp['Country']))

# replace df_pop.Country wherever the code appears in df_gdp
df_renew['Country'] = df_renew['Code'].map(code_to_name).fillna(df_renew['Country'])
df_energy_use['Country'] = df_energy_use['Code'].map(code_to_name).fillna(df_energy_use['Country'])
df_pop['Country'] = df_pop['Code'].map(code_to_name).fillna(df_pop['Country'])

# Drop rows with missing values
# df_co2.dropna(subset=["Annual_CO2_Emissions_Per_Capita"], inplace=True)
# df_renew.dropna(subset=["Renewable_Energy_Percentage"], inplace=True)
# df_gdp.dropna(subset=["GDP_Per_Capita"], inplace=True)
# df_energy_use.dropna(subset=["Energy_Consumption_Per_Capita"], inplace=True)
# df_pop.dropna(subset=["Population"], inplace=True)

# Merge all five datasets on Country and Year
merged_df = pd.merge(df_co2, df_renew, on=["Country", "Year"], how="outer")
merged_df = pd.merge(merged_df, df_gdp, on=["Country", "Year", "Code"], how="outer")
merged_df = pd.merge(merged_df, df_energy_use, on=["Country", "Year", "Code"], how="outer")
merged_df = pd.merge(merged_df, df_pop, on=["Country", "Year", "Code"], how="outer")

# Reorder Code column
col = merged_df.pop('Code')
merged_df.insert(2, 'Code', col)

# Filter for years between 2010 and 2023
merged_df = merged_df[(merged_df["Year"] >= 2010) & (merged_df["Year"] <= 2023)]

merged_df.dropna(subset=["Annual_CO2_Emissions_Per_Capita", "Renewable_Energy_Percentage", "GDP_Per_Capita", "Energy_Consumption_Per_Capita", "Population"], inplace=True)
# merged_df.dropna(subset=["Annual_CO2_Emissions_Per_Capita"], inplace=True)
merged_df.dropna(subset=["Code"], inplace=True)

# # Optional: Remove aggregates like "World", "Asia", "Africa", etc.
excluded = ["World", "Asia", "Africa", "Europe", "North America", "South America", "Oceania"]
merged_df = merged_df[~merged_df["Country"].isin(excluded)]

# Reset index
merged_df.reset_index(drop=True, inplace=True)

# Save to CSV
merged_df.to_csv("merged_dataset.csv", index=False)
print("Data Merged....")

