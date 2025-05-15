from flask import Flask, jsonify, request, render_template
from flask_cors import CORS, cross_origin
import pandas as pd
from sklearn.decomposition import PCA
from sklearn.preprocessing import StandardScaler
from sklearn.cluster import KMeans
from sklearn.manifold import MDS
import numpy as np
from kneed import KneeLocator


app = Flask(__name__)
# CORS(app)
# CORS(app, resources={r"/*": {"origins": "http://127.0.0.1:5500"}})  # Allow frontend origin
# CORS(app, resources={r"/*": {"origins": "http://127.0.0.1:5500"}}, supports_credentials=True)



# Loading the dataset
file_path = "Dataset/merged_dataset.csv"
df = pd.read_csv(file_path)
# print(df.head())

# Select countries of interest
# countries = ['USA', 'AUS', 'CHN']
# countries = ['United States', 'Australia', 'China']
# globalYear = 2020

@app.route('/')
def index():
    return render_template('index.html')

@app.route("/api/map_data")
def get_map_data():
    year = int(request.args.get("year", 2020)) # default 2020
    # print(year)
    # Filter to 2020 and select only the code + emission columns
    s = df[df['Year'] == year][['Code', 'Annual_CO2_Emissions_Per_Capita']]
    # print(s)
    
    # Drop any rows where Carbon_Emissions is NaN
    s = s.dropna(subset=['Annual_CO2_Emissions_Per_Capita'])
    s = s.dropna(subset=['Code'])
    
    # Rename for your D3 lookup and convert to list of dicts
    recs = (
        s.rename(columns={
            'Code': 'id',
            'Annual_CO2_Emissions_Per_Capita': 'value'
        })
        .to_dict(orient='records')
    )
    
    return jsonify(recs)


@app.route('/api/line_chart')
def get_line_chart():
    # print("Coming.....")
    codes = request.args.get('codes','').split(',')
    # print(codes)
    codes = [c.strip() for c in codes if c.strip()]
    out = []
    for code in codes:
        ts = (df[df['Code']==code]
              .sort_values('Year')
              .dropna(subset=['Annual_CO2_Emissions_Per_Capita'])
              [['Year','Annual_CO2_Emissions_Per_Capita']]
              .to_dict(orient='records'))
        out.append({'code': code, 'values': ts})
    # print(out)
    return jsonify(out)

  
@app.route("/api/pcp", methods=["GET"])
def get_pcp():
    year = int(request.args.get("year", 2020)) # default 2020
    df20 = df[df.Year == year]
    # explicitly pick only the three numeric features you care about
    features = [
        "Code",
        "Annual_CO2_Emissions_Per_Capita",
        "Renewable_Energy_Percentage", 
        "GDP_Per_Capita",
        "Energy_Consumption_Per_Capita",
        "Population"
    ]

    # 3) Make a fresh copy
    df_copy = df20[features].copy()

    # 4) Bucket CO₂ into three groups: low, medium, high
    df_copy["cluster"] = pd.qcut(
        df_copy["Annual_CO2_Emissions_Per_Capita"],
        q=3,
        labels=["low","medium","high"]
    )

    # rename Code → code, plus your other renames
    df_copy = df_copy.rename(columns={
        "Code": "code",
        "Annual_CO2_Emissions_Per_Capita":  "CO₂ Emissions",
        "Renewable_Energy_Percentage":      "Renewable Energy %",
        "GDP_Per_Capita":                   "GDP",
        "Energy_Consumption_Per_Capita":    "Energy Consumption",
        "Population":                       "Population"
    })


    # 5) Nulls → None for JSON
    df_copy = df_copy.where(pd.notnull(df_copy), None)

    # 6) Return everything as records
    return jsonify(df_copy.to_dict(orient="records"))


@app.route("/api/radar_plot", methods=["GET"])
def get_radar_plot():
    # parse ISO3 codes
    codes = request.args.get("codes", "")
    year  = int(request.args.get("year", 2020))
    codes = [c.strip() for c in codes.split(",") if c.strip()]

    # snapshot of only those codes for 2020
    snap = df[(df.Year == year) & (df.Code.isin(codes))]

    # rename to our JS keys
    recs = (
        snap[[
            "Country",
            "Annual_CO2_Emissions_Per_Capita",
            "Renewable_Energy_Percentage",
            "Energy_Consumption_Per_Capita",
            "GDP_Per_Capita"
        ]]
        .rename(columns={
            "Country":                           "country",
            "Annual_CO2_Emissions_Per_Capita":  "co2_emissions",
            "Renewable_Energy_Percentage":      "renewable_energy",
            "Energy_Consumption_Per_Capita":    "energy_consumption",
            "GDP_Per_Capita":                   "gdp"
        })
        .to_dict(orient="records")
    )

    # compute global min/max on all 2020 rows for each metric
    df20 = df[df.Year == year]
    mapping = {
      "Annual_CO2_Emissions_Per_Capita": "co2_emissions",
      "Energy_Consumption_Per_Capita":   "energy_consumption",
      "GDP_Per_Capita":                  "gdp",
      "Renewable_Energy_Percentage":     "renewable_energy" 
    }
    extents = {}
    for col, key in mapping.items():
        vals = pd.to_numeric(df20[col], errors="coerce").dropna()
        extents[key] = {"min": vals.min(), "max": vals.max()}

    return jsonify({"data": recs, "extents": extents})


# in app.py

@app.route("/api/top_emitters", methods=["GET"])
def get_top_emitters():
    # take 2020 slice, pick Code+Country+CO2 per capita
    year  = int(request.args.get("year", 2020))
    df20 = df[df.Year == year][['Code','Country','Annual_CO2_Emissions_Per_Capita']]

    # sort descending and grab top 5
    top5 = (
      df20
      .sort_values('Annual_CO2_Emissions_Per_Capita', ascending=False)
      .head(5)
      .rename(columns={
        'Code': 'code',
        'Country': 'country',
        'Annual_CO2_Emissions_Per_Capita': 'co2'
      })
    )

    return jsonify(top5.to_dict(orient='records'))


@app.route("/api/years", methods=["GET"])
def get_years():
    # assume df has a column Year
    years = sorted(df['Year'].dropna().astype(int).unique().tolist())
    return jsonify(years)


@app.route("/api/pcp_selected", methods=["GET"])
def get_pcp_selected():
    codes = request.args.get("codes", "")
    year_start  = int(request.args.get("year_start", None))
    year_end   = int(request.args.get("year_end", None))
    codes = [c.strip() for c in codes.split(",") if c.strip()]

    print(codes)
    print(year_end)
    print(year_start)

    # snapshot of only those codes for 2020
    df20 = df[((df.Year >= year_start) & (df.Year <= year_end)) & (df.Code.isin(codes))]

    # explicitly pick only the three numeric features you care about
    features = [
        "Code",
        "Annual_CO2_Emissions_Per_Capita",
        "Renewable_Energy_Percentage", 
        "GDP_Per_Capita",
        "Energy_Consumption_Per_Capita",
        "Population"
    ]

    # 3) Make a fresh copy
    df_copy = df20[features].copy()

    # 4) Bucket CO₂ into three groups: low, medium, high
    df_copy["cluster"] = pd.qcut(
        df_copy["Annual_CO2_Emissions_Per_Capita"],
        q=3,
        labels=["low","medium","high"]
    )

    # rename Code → code, plus your other renames
    df_copy = df_copy.rename(columns={
        "Code": "code",
        "Annual_CO2_Emissions_Per_Capita":  "CO₂ Emissions",
        "Renewable_Energy_Percentage":      "Renewable Energy %",
        "GDP_Per_Capita":                   "GDP",
        "Energy_Consumption_Per_Capita":    "Energy Consumption",
        "Population":                       "Population"
    })


    # 5) Nulls → None for JSON
    df_copy = df_copy.where(pd.notnull(df_copy), None)

    # 6) Return everything as records
    return jsonify(df_copy.to_dict(orient="records"))




if __name__ == "__main__":
    app.run(debug=True)


